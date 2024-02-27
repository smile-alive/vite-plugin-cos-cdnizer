import chalk from 'chalk';

export type TLogLevel = keyof typeof chalkConfig;

export type TLogMethods = {
	[K in TLogLevel]: (msg: any) => void;
};

// Log config
const chalkConfig = {
	success: chalk.bold.green,
	cache: chalk.bold.blue,
	error: chalk.bold.red,
	info: chalk.bold.gray
};

export const log = Object.keys(chalkConfig).reduce(
	(acc, cur) => ({
		...acc,
		[cur as TLogLevel]: (msg: any) => console.log(chalkConfig[cur as TLogLevel](msg))
	}),
	{} as TLogMethods
);
