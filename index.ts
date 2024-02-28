import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import COS from 'cos-nodejs-sdk-v5';
import chalk from 'chalk';
import { normalizePath, type Plugin } from 'vite';

interface IStaticCdnizerPluginOptions {
	/**
	 * 身份密钥 ID {@link https://console.cloud.tencent.com/cam/capi}
	 */
	secretId: string;
	/**
	 * 身份密钥 Key
	 */
	secretKey: string;
	/**
	 * 存储桶的名称
	 */
	bucket: string;
	/**
	 * 存储桶所在地域 {@link https://cloud.tencent.com/document/product/436/6224}
	 */
	region: string;
	/**
	 * 自定义 CDN 域名
	 * @default `${bucket}.cos.${region}.myqcloud.com`
	 */
	domain?: string;
	/**
	 * 自定义上传路径
	 * @default `${projectName}/${fileName}`
	 */
	uploadPath?: string;
	/**
	 * 自定义命中文件规则
	 * @default ['.png', '.jpg', '.jpeg', '.svg', '.gif']
	 */
	include?: string[] | ((path: string) => boolean);
	/**
	 * 是否对上传的文件名称进行 MD5 编码
	 * @default true
	 */
	enableMD5FileName?: boolean;
	/**
	 * 是否缓存已上传文件
	 * @default true
	 */
	enableCache?: boolean;
}

type TUploadFileResp = {
	url: string;
	status: StatusCode;
	message?: string;
};

type TCacheData = Record<string, string>;

type TLogLevel = keyof typeof chalkConfig;

type TLogMethods = {
	[K in TLogLevel]: (msg: any) => void;
};

// Log config
const chalkConfig = {
	success: chalk.bold.green,
	cache: chalk.bold.blue,
	error: chalk.bold.red,
	info: chalk.bold.gray
};

const logger = Object.keys(chalkConfig).reduce(
	(acc, cur) => ({
		...acc,
		[cur as TLogLevel]: (msg: any) => console.log(chalkConfig[cur as TLogLevel](msg))
	}),
	{} as TLogMethods
);

const LOG_BANNER =
	'\n-------------------------------------------------------\n\t\t 📝 COS uploadFile log\n-------------------------------------------------------';

enum StatusCode {
	SUCCESS = 200,
	CACHE = 304,
	NOTFOUND = 404,
	ERROR = 500
}

const statusCodeLogLevels: Record<StatusCode, TLogLevel> = {
	[StatusCode.SUCCESS]: 'success',
	[StatusCode.CACHE]: 'cache',
	[StatusCode.ERROR]: 'error',
	[StatusCode.NOTFOUND]: 'info'
};

const concatDomainAndPath = (domain: string, path: string) =>
	`${domain.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

export const getTime = () => {
	const date = new Date();
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');
	return `${hours}:${minutes}:${seconds}`;
};

export default function StaticCdnizerPlugin(options: IStaticCdnizerPluginOptions): Plugin {
	const {
		bucket,
		region,
		uploadPath,
		domain = `https://${bucket}.cos.${region}.myqcloud.com/`,
		include = ['.png', '.jpg', '.jpeg', '.svg', '.gif'],
		enableMD5FileName = true,
		enableCache = true
	} = options;

	// Init COS
	const cos = new COS({
		SecretId: options.secretId,
		SecretKey: options.secretKey
	});

	// Get project info
	const projectPath = process.cwd();
	const projectName = path.basename(projectPath);

	// Cache setting
	const cachePath = path.join(projectPath, '.cache.json');
	let cacheData: TCacheData = {};

	const writeCache = (data: TCacheData) => {
		const jsonData = JSON.stringify(data, null, 2);
		fs.writeFileSync(cachePath, jsonData, 'utf-8');
	};

	const readCache = (): TCacheData => {
		if (fs.existsSync(cachePath)) {
			const data = fs.readFileSync(cachePath, 'utf-8');
			return JSON.parse(data);
		}
		return {};
	};

	const createCache = () => {
		cacheData = readCache();
		if (!fs.existsSync(cachePath)) {
			writeCache({});
		}
	};
	createCache();

	const getDate = (key: string) => enableCache && !!cacheData[key];
	const setDate = (key: string, value: any) => {
		if (enableCache) {
			cacheData[key] = value;
			writeCache(cacheData);
		}
	};

	// Async COS.putObject
	const putObjectPromise = (
		params: COS.PutObjectParams
	): Promise<[COS.CosError, COS.PutObjectResult]> => {
		return new Promise((resolve) => cos.putObject(params, (...arg) => resolve(arg)));
	};

	// 只处理上传操作
	const uploadFile = async (file: string): Promise<TUploadFileResp> => {
		// 获取文件扩展名
		const fileExt = path.extname(file);
		// 获取当前文件名
		const fileName = path.basename(file, fileExt);
		// 将当前文件名进行 MD5 编码
		const fileMD5Name = crypto.createHash('md5').update(fileName).digest('hex');
		// 文件名合并
		const fullFileName = `${enableMD5FileName ? fileMD5Name : fileName}${fileExt}`;

		// cos 上传必要参数
		const fileKey = path.join('/', uploadPath ?? projectName, fullFileName);
		const fileBody = fs.createReadStream(file);
		const { size: fileSize } = await fs.promises.stat(file);
		// 拼接最终展示的 CDN 地址
		const url = concatDomainAndPath(domain, fileKey);

		// 判断是否存在缓存
		if (getDate(fileKey)) {
			return {
				url,
				status: StatusCode.CACHE
			};
		}

		const [err, data] = await putObjectPromise({
			Bucket: bucket,
			Region: region,
			Key: fileKey,
			Body: fileBody,
			ContentLength: fileSize
		});

		if (err) {
			const message = `${err.code} at ${err.message}`;
			return {
				message,
				url,
				status: StatusCode.ERROR
			};
		}

		if (data) {
			setDate(fileKey, file);
			return {
				url,
				status: StatusCode.SUCCESS
			};
		}

		return {
			url,
			status: StatusCode.NOTFOUND
		};
	};

	let isFirst = 0;

	return {
		name: 'vite-plugin-cos-cdnizer',
		async transform(_code, file) {
			const normalizedFile = normalizePath(file);
			// 只对 src 下的文件进行处理
			if (!normalizedFile.includes('/src/')) return;

			const fileExtension = path.extname(normalizedFile);

			if (
				typeof include === 'function'
					? include(normalizedFile)
					: include.includes(fileExtension)
			) {
				if (++isFirst === 1) {
					logger.info(LOG_BANNER);
				}

				// 只关注获取到的结果
				const { status, url, message } = await uploadFile(normalizedFile);
				// logger 统一处理
				const logLevel = statusCodeLogLevels[status];
				const logPrefix = message ? `${logLevel}: ${message}` : logLevel;
				logger[logLevel](`[${getTime()}] (${logPrefix}) ${file} => ${url}`);

				if ([StatusCode.SUCCESS, StatusCode.CACHE].includes(status)) {
					return `export default '${url}';`;
				}
			}
		}
	};
}
