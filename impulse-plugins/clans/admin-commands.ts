import { clanManager } from './manager';
import { ClanRank, ClanRankNames } from './types';
import { clanDatabase, clanInviteDatabase } from './database';
import type { Room } from '../rooms';

function sendClanMessage(clanId: ID, message: string) {
    const clanRoom = Rooms.get(clanId);
    if (clanRoom) {
        clanRoom.add(`|c|~|${message}`).update();
    }
}

export const commands: Chat.Commands = {
    async createclan(target, room, user) {
        this.checkCan('bypassall');
        if (!target) {
            throw new Chat.ErrorMessage(`/createclan [clan name],[leader username] - Creates a new clan.`);
        }
        const [clanName, leaderName] = target.split(',').map(param => param.trim());
        if (!clanName || !leaderName) {
            throw new Chat.ErrorMessage(`Usage: /createclan [clan name],[leader username]`);
        }
        try {
            const targetUser = Users.getExact(leaderName);
            if (!targetUser?.connected) {
                throw new Chat.ErrorMessage(`User '${leaderName}' not found or not online.`);
            }
            const clan = await clanManager.createClan(clanName, targetUser.id);
            // Create clan chatroom
            const clanRoomId = toID(clan.name);
            if (Rooms.get(clanRoomId)) {
                throw new Chat.ErrorMessage(`Room '${clanRoomId}' already exists.`);
            }
            // Create the room
            const clanRoom = Rooms.createChatRoom(clanRoomId, clan.name, {
                isPrivate: true,
                modjoin: '+',
                auth: {
                    [targetUser.id]: '#',
                },
                introMessage: `<div class="infobox">` +
                    `<div style="text-align: center">` +
                    `<h2>${Chat.escapeHTML(clan.name)}</h2>` +
                    `<p>Welcome to the ${Chat.escapeHTML(clan.name)} clan room!</p>` +
                    `<p><strong>Clan Leader:</strong> ${Chat.escapeHTML(targetUser.name)}</p>` +
                    `<p><strong>Created:</strong> ${Chat.toTimestamp(new Date())}</p>` +
                    `<p><strong>Points:</strong> 1000</p>` +
                    `<div id="clan-icon"></div>` +  // Placeholder for icon
                    `<p id="clan-description"></p>` +  // Placeholder for description
                    `</div></div>`,
                staffMessage: `<div class="infobox">` +
                    `<h3>Clan Room Staff Guide</h3>` +
                    `<p>Room ranks:</p>` +
                    `<ul>` +
                    `<li><strong>#</strong> - Clan Leader</li>` +
                    `<li><strong>@</strong> - Clan Deputy</li>` +
                    `<li><strong>%</strong> - Clan Senior</li>` +
                    `<li><strong>+</strong> - Clan Member</li>` +
                    `</ul></div>`,
            });
            
            if (!clanRoom) {
                throw new Error(`Failed to create clan room: ${clanRoomId}`);
            }
            // Save room settings
            clanRoom.persist = true;
            clanRoom.settings.modjoin = '+';
            clanRoom.settings.isPrivate = true;
            clanRoom.saveSettings();
            this.globalModlog('CLANCREATE', targetUser, `${clan.name} (by ${user.name})`);
            sendClanMessage(clan.id, `The clan ${clan.name} has been created with ${targetUser.name} as the leader.`);
            return this.sendReply(
                `Clan "${clan.name}" has been created with ${targetUser.name} as the leader. ` +
                `The clan chatroom "${clanRoomId}" has been created.`
            );
        } catch (error) {
            throw new Chat.ErrorMessage(error.message);
        }
    },
    
    async deleteclan(target, room, user) {
        this.checkCan('bypassall');
        if (!target) {
            throw new Chat.ErrorMessage(`/deleteclan [clan name] - Deletes a clan.`);
        }
        const clanId = toID(target);
        const clan = await clanManager.getClan(clanId);
        if (!clan) {
            throw new Chat.ErrorMessage(`Clan "${target}" not found.`);
        }
        try {
            // Announce deletion in clan room before destroying it
            sendClanMessage(clan.id, `The clan ${clan.name} has been deleted by ${user.name}.`);
            // Delete clan room if it exists
            const clanRoom = Rooms.get(clanId);
            if (clanRoom) {
                clanRoom.destroy();
            }
            await clanManager.deleteClan(clan.id);
            this.globalModlog('CLANDELETE', null, `${clan.name} (by ${user.name})`);
            return this.sendReply(`Successfully deleted clan ${clan.name} and its chatroom.`);
        } catch (error) {
            throw new Chat.ErrorMessage(`Failed to delete clan: ${error.message}`);
        }
    },

    async givepoints(target, room, user) {
        this.checkCan('bypassall');

        if (!target) {
            throw new Chat.ErrorMessage(`/givepoints [clan name],[points] - Gives points to a clan.`);
        }

        const [clanName, pointsStr] = target.split(',').map(param => param.trim());
        const points = Number(pointsStr);

        if (!clanName || isNaN(points) || points <= 0) {
            throw new Chat.ErrorMessage(`Usage: /givepoints [clan name],[points]. Points must be a positive number.`);
        }

        const clan = await clanDatabase.getClan(toID(clanName));
        if (!clan) {
            throw new Chat.ErrorMessage(`Clan "${clanName}" not found.`);
        }

        clan.points += points;
        await clanDatabase.saveClan(clan);

        this.globalModlog('GIVEPOINTS', null, `${points} points to ${clan.name} (by ${user.name})`);
        sendClanMessage(clan.id, `${user.name} has given ${points} points to the clan. Total points: ${clan.points}`);
        return this.sendReply(`Successfully gave ${points} points to clan "${clan.name}". Total points: ${clan.points}`);
    },

    async takepoints(target, room, user) {
        this.checkCan('bypassall');

        if (!target) {
            throw new Chat.ErrorMessage(`/takepoints [clan name],[points] - Deducts points from a clan.`);
        }

        const [clanName, pointsStr] = target.split(',').map(param => param.trim());
        const points = Number(pointsStr);

        if (!clanName || isNaN(points) || points <= 0) {
            throw new Chat.ErrorMessage(`Usage: /takepoints [clan name],[points]. Points must be a positive number.`);
        }

        const clan = await clanDatabase.getClan(toID(clanName));
        if (!clan) {
            throw new Chat.ErrorMessage(`Clan "${clanName}" not found.`);
        }

        if (clan.points - points < 0) {
            throw new Chat.ErrorMessage(`Cannot deduct ${points} points from clan "${clan.name}" as it would result in negative points.`);
        }

        clan.points -= points;
        await clanDatabase.saveClan(clan);

        this.globalModlog('TAKEPOINTS', null, `${points} points from ${clan.name} (by ${user.name})`);
        sendClanMessage(clan.id, `${user.name} has deducted ${points} points from the clan. Total points: ${clan.points}`);
        return this.sendReply(`Successfully deducted ${points} points from clan "${clan.name}". Total points: ${clan.points}`);
    },

    async setclanicon(target, room, user) {
        if (!target) {
            throw new Chat.ErrorMessage(`/setclanicon [clan name], [icon URL] - Sets a clan's icon. Requires: Clan Leader or &`);
        }

        const [clanName, iconUrl] = target.split(',').map(param => param.trim());
        if (!clanName || !iconUrl) {
            throw new Chat.ErrorMessage(`Usage: /setclanicon [clan name], [icon URL]`);
        }

        const clan = await clanDatabase.getClan(toID(clanName));
        if (!clan) {
            throw new Chat.ErrorMessage(`Clan "${clanName}" not found.`);
        }

        // Check permissions
        if (!this.can('bypassall')) {
            const member = clan.members.find(m => m.id === toID(user.id));
            if (!member || member.rank !== ClanRank.LEADER) {
                throw new Chat.ErrorMessage(`You must be the clan leader to set the clan icon.`);
            }
        }

        try {
            const success = await clanManager.setClanIcon(clan.id, iconUrl);
            if (!success) {
                throw new Error('Failed to set clan icon.');
            }

            // Update clan room's intro message if it exists
            const clanRoom = Rooms.get(clan.id);
            if (clanRoom) {
                const iconHtml = `<div id="clan-icon"><img src="${Chat.escapeHTML(iconUrl)}" width="32" height="32" alt="${Chat.escapeHTML(clan.name)} Icon" /></div>`;
                clanRoom.settings.introMessage = clanRoom.settings.introMessage.replace(
                    /<div id="clan-icon">.*?<\/div>/,
                    iconHtml
                );
                clanRoom.saveSettings();
            }

            this.globalModlog('SETCLANICON', user, `${clan.name}`);
            sendClanMessage(clan.id, `${user.name} has set a new clan icon.`);
            return this.sendReply(`Successfully set icon for clan "${clan.name}".`);
        } catch (error) {
            throw new Chat.ErrorMessage(error.message);
        }
    },

    async removeclanicon(target, room, user) {
        if (!target) {
            throw new Chat.ErrorMessage(`/removeclanicon [clan name] - Removes a clan's icon. Requires: Clan Leader or &`);
        }

        const clan = await clanDatabase.getClan(toID(target));
        if (!clan) {
            throw new Chat.ErrorMessage(`Clan "${target}" not found.`);
        }

        // Check permissions
        if (!this.can('bypassall')) {
            const member = clan.members.find(m => m.id === toID(user.id));
            if (!member || member.rank !== ClanRank.LEADER) {
                throw new Chat.ErrorMessage(`You must be the clan leader to remove the clan icon.`);
            }
        }

        try {
            const success = await clanManager.setClanIcon(clan.id, undefined);
            if (!success) {
                throw new Error('Failed to remove clan icon.');
            }

            // Update clan room's intro message if it exists
            const clanRoom = Rooms.get(clan.id);
            if (clanRoom) {
                clanRoom.settings.introMessage = clanRoom.settings.introMessage.replace(
                    /<div id="clan-icon">.*?<\/div>/,
                    '<div id="clan-icon"></div>'
                );
                clanRoom.saveSettings();
            }

            this.globalModlog('REMOVECLANICON', user, `${clan.name}`);
            sendClanMessage(clan.id, `${user.name} has removed the clan icon.`);
            return this.sendReply(`Successfully removed icon from clan "${clan.name}".`);
        } catch (error) {
            throw new Chat.ErrorMessage(error.message);
        }
    },

    async setclandesc(target, room, user) {
        if (!target) {
            throw new Chat.ErrorMessage(`/setclandesc [clan name], [description] - Sets a clan's description. Requires: Clan Leader or &`);
        }

        const [clanName, description] = target.split(',').map(param => param.trim());
        if (!clanName || !description) {
            throw new Chat.ErrorMessage(`Usage: /setclandesc [clan name], [description]`);
        }

        const clan = await clanDatabase.getClan(toID(clanName));
        if (!clan) {
            throw new Chat.ErrorMessage(`Clan "${clanName}" not found.`);
        }

        // Check permissions
        if (!this.can('bypassall')) {
            const member = clan.members.find(m => m.id === toID(user.id));
            if (!member || member.rank !== ClanRank.LEADER) {
                throw new Chat.ErrorMessage(`You must be the clan leader to set the clan description.`);
            }
        }

        try {
            const success = await clanManager.setClanDescription(clan.id, description);
            if (!success) {
                throw new Error('Failed to set clan description.');
            }

            // Update clan room's intro message if it exists
            const clanRoom = Rooms.get(clan.id);
            if (clanRoom) {
                clanRoom.settings.introMessage = clanRoom.settings.introMessage.replace(
                    /<p id="clan-description">.*?<\/p>/,
                    `<p id="clan-description">${Chat.escapeHTML(description)}</p>`
                );
                clanRoom.saveSettings();
            }

            this.globalModlog('SETCLANDESC', user, `${clan.name}`);
            sendClanMessage(clan.id, `${user.name} has set a new clan description.`);
            return this.sendReply(`Successfully set description for clan "${clan.name}".`);
        } catch (error) {
            throw new Chat.ErrorMessage(error.message);
        }
    },

    async removeclandesc(target, room, user) {
        if (!target) {
            throw new Chat.ErrorMessage(`/removeclandesc [clan name] - Removes a clan's description. Requires: Clan Leader or &`);
        }

        const clan = await clanDatabase.getClan(toID(target));
        if (!clan) {
            throw new Chat.ErrorMessage(`Clan "${target}" not found.`);
        }

        // Check permissions
        if (!this.can('bypassall')) {
            const member = clan.members.find(m => m.id === toID(user.id));
            if (!member || member.rank !== ClanRank.LEADER) {
                throw new Chat.ErrorMessage(`You must be the clan leader to remove the clan description.`);
            }
        }

        try {
            const success = await clanManager.setClanDescription(clan.id, undefined);
            if (!success) {
                throw new Error('Failed to remove clan description.');
            }

            // Update clan room's intro message if it exists
            const clanRoom = Rooms.get(clan.id);
            if (clanRoom) {
                clanRoom.settings.introMessage = clanRoom.settings.introMessage.replace(
                    /<p id="clan-description">.*?<\/p>/,
                    '<p id="clan-description"></p>'
                );
                clanRoom.saveSettings();
            }

            this.globalModlog('REMOVECLANDESC', user, `${clan.name}`);
            sendClanMessage(clan.id, `${user.name} has removed the clan description.`);
            return this.sendReply(`Successfully removed description from clan "${clan.name}".`);
        } catch (error) {
            throw new Chat.ErrorMessage(error.message);
        }
    },
};
