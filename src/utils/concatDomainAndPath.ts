export const concatDomainAndPath = (domain: string, path: string) =>
	`${domain.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
