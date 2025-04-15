export enum ClanRank {
    LEADER = 5,
    DEPUTY = 4,
    SENIOR = 3,
    MEMBER = 2,
    RECRUIT = 1
}

export const ClanRankNames: { [key in ClanRank]: string } = {
    [ClanRank.LEADER]: 'Leader',
    [ClanRank.DEPUTY]: 'Deputy',
    [ClanRank.SENIOR]: 'Senior',
    [ClanRank.MEMBER]: 'Member',
    [ClanRank.RECRUIT]: 'Recruit',
};

export interface ClanMember {
    id: ID;
    rank: ClanRank;
    joinedAt: number;
}

export interface ClanData {
    id: ID;
    name: string;
    leader: ID;
    members: ClanMember[];
    createdAt: number;
}

export interface ClanManager {
    createClan(name: string, leaderId: ID): Promise<ClanData>;
    deleteClan(clanId: ID): Promise<boolean>;
    getClan(clanId: ID): Promise<ClanData | null>;
    setRank(clanId: ID, userId: ID, rank: ClanRank): Promise<boolean>;
}