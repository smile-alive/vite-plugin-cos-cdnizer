import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import chalk from 'chalk';
import COS from 'cos-nodejs-sdk-v5';
import { normalizePath, type Plugin } from 'vite';

interface RuxPluginOptions {
	/**
	 * 身份密钥 ID
	 * @see {@link https://console.cloud.tencent.com/cam/capi}
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
	 * 存储桶所在地域
	 * @see {@link https://cloud.tencent.com/document/product/436/6224}
	 */
	region: string;
	/**
	 * 自定义 CDN 域名
	 * @defaultValue `${bucket}.cos.${region}.myqcloud.com`
	 */
	domain?: string;
	/**
	 * 自定义上传路径
	 * @defaultValue `${projectName}/${fileName}`
	 */
	uploadPath?: string;
	/**
	 * 自定义命中文件规则
	 * @defaultValue ['.png', '.jpg', '.jpeg', '.svg', '.gif']
	 */
	include?: string[] | ((path: string) => boolean);
	/**
	 * 是否对上传的文件名称进行 MD5 编码
	 * @defaultValue true
	 */
	enableMD5FileName?: boolean;
	/**
	 * 是否缓存已上传文件
	 * @defaultValue true
	 */
	enableCache?: boolean;
}

interface UploadFileType {
	url: string;
	status: number;
	message?: string;
}

type CacheDataType = Record<string, string>;

//  Log
type LogLevel = 'success' | 'cache' | 'error' | 'info';
type LogMethods = {
	[K in LogLevel]: (msg: any) => void;
};
type LogType = typeof console.log & LogMethods;

const log = console.log as LogType;
log.success = (msg) => log(chalk.bold.green(msg));
log.cache = (msg) => log(chalk.bold.blue(msg));
log.error = (msg) => log(chalk.bold.red(msg));
log.info = (msg) => log(chalk.bold.gray(msg));

const SUCCESS = 200,
	CACHE = 304,
	NOTFOUND = 404,
	ERROR = 500;

const concatDomainAndPath = (domain: string, path: string) => {
	if (domain.endsWith('/')) {
		domain = domain.slice(0, -1);
	}
	if (path.startsWith('/')) {
		path = path.slice(1);
	}

	return `${domain}/${path}`;
};

const getTime = () => {
	const date = new Date();
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');
	return `${hours}:${minutes}:${seconds}`;
};

export default function Rux({
	bucket,
	region,
	uploadPath,
	domain = `https://${bucket}.cos.${region}.myqcloud.com/`,
	include = ['.png', '.jpg', '.jpeg', '.svg', '.gif'],
	enableMD5FileName = true,
	enableCache = true,
	...options
}: RuxPluginOptions): Plugin {
	// init cos
	const cos = new COS({
		SecretId: options.secretId,
		SecretKey: options.secretKey
	});

	// 获取项目相关信息
	const projectPath = process.cwd();
	const projectName = path.basename(projectPath);

	// cache start
	const cachePath = path.join(projectPath, '.cache.json');
	let cacheData: CacheDataType = {};

	const writeCache = (data: CacheDataType) => {
		const jsonData = JSON.stringify(data, null, 2);
		fs.writeFileSync(cachePath, jsonData, 'utf-8');
	};

	const readCache = (): CacheDataType => {
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
	// cache end

	const putObjectSync = (
		params: COS.PutObjectParams
	): Promise<[COS.CosError, COS.PutObjectResult]> => {
		return new Promise((resolve) => {
			cos.putObject(params, (...arg) => resolve(arg));
		});
	};

	const uploadFile = async (file: string): Promise<UploadFileType> => {
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

		// url 处理
		const url = concatDomainAndPath(domain, fileKey);
		const msg = (type: LogLevel) => `[${getTime()}] (${type}) ${file} => ${fileKey}`;

		// 判断是否存在缓存
		if (getDate(fileKey)) {
			log.cache(msg('cache'));
			return {
				url,
				status: 304
			};
		}

		const [err, data] = await putObjectSync({
			Bucket: bucket,
			Region: region,
			Key: fileKey,
			Body: fileBody,
			ContentLength: fileSize
		});

		if (err) {
			const message = `${err.code} at ${err.message}`;
			log.error(msg(`error: ${message}` as LogLevel));
			return {
				message,
				url,
				status: ERROR
			};
		}

		if (data) {
			setDate(fileKey, file);
			log.success(msg('success'));
			return {
				url,
				status: SUCCESS
			};
		}

		log.info(msg('info'));
		return {
			url,
			status: NOTFOUND
		};
	};

	let isFirst = 0;

	return {
		name: 'vite-plugin-rux',
		async transform(code, file) {
			const normalizedFile = normalizePath(file);
			// 只对 src 下的文件进行处理
			if (!normalizedFile.includes('/src/')) return;

			const fileExtension = path.extname(normalizedFile);

			if (
				typeof include === 'function'
					? include(normalizedFile)
					: include.includes(fileExtension)
			) {
				if (++isFirst && isFirst === 1) {
					log.info(
						'\n-------------------------------------------------------\n\t\t 📝 COS uploadFile log\n-------------------------------------------------------'
					);
				}

				// 只关注获取到的结果
				const { status, url } = await uploadFile(normalizedFile);
				if ([SUCCESS, CACHE].includes(status)) {
					return `export default '${url}';`;
				}
			}
		}
	};
}
