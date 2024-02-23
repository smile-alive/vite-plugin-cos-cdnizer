import COS from 'cos-nodejs-sdk-v5';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import chalk from 'chalk';
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
}

type CacheDataType = Record<string, any>;

type UploadFileType = {
	status: number;
	url: string;
};

const SUCCESS = 200,
	CACHE = 304,
	ERROR = 500;

const logHandlers = {
	[SUCCESS]: (msg: any) => console.log(chalk.bold.green(msg)),
	[CACHE]: (msg: any) => console.log(chalk.bold.blue(msg)),
	[ERROR]: (msg: any) => console.log(chalk.bold.red(msg))
};

const log = (type: keyof typeof logHandlers, message: any) => {
	(logHandlers[type] ?? console.log)(message);
};

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
	domain = `${bucket}.cos.${region}.myqcloud.com/`,
	include = ['.png', '.jpg', '.jpeg', '.svg', '.gif'],
	enableMD5FileName = true,
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

	const getDate = (key: string) => cacheData[key];
	const setDate = (key: string, value: any) => {
		cacheData[key] = value;
		writeCache(cacheData);
	};
	// cache end

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
		const fileKey = path.join(uploadPath ?? projectName, fullFileName);
		const fileBody = fs.createReadStream(file);
		const { size: fileSize } = await fs.promises.stat(file);

		// url 处理
		const url = concatDomainAndPath(domain, fileKey);
		const msg = `[${getTime()}] ${fullFileName} => ${file}`;

		return new Promise((resolve, reject) => {
			// 判断是否存在缓存
			if (getDate(fullFileName)) {
				log(CACHE, msg);

				return resolve({
					url,
					status: 304
				});
			}

			// NOTE：这里还需要优化
			cos.putObject(
				{
					Bucket: bucket,
					Region: region,
					Key: fileKey,
					Body: fileBody,
					ContentLength: fileSize
				},
				(err, data) => {
					if (data?.statusCode === SUCCESS) {
						setDate(fullFileName, file);
						log(SUCCESS, msg);

						return resolve({
							url,
							status: data.statusCode
						});
					}

					if (err) {
						return reject(err);
					}
				}
			);
		});
	};

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
				// 只关注获取到的结果
				const { status, url } = await uploadFile(normalizedFile);
				if ([SUCCESS, CACHE].includes(status)) {
					return `export default '${url}';`;
				}
			}
		}
	};
}
