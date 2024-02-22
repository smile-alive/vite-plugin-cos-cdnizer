import COS from 'cos-nodejs-sdk-v5';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { normalizePath, type Plugin } from 'vite';

interface RuxPluginOptions {
	/** 身份密钥 ID @see {@link https://console.cloud.tencent.com/cam/capi} */
	secretId: string;
	/** 身份密钥 Key @see {@link https://console.cloud.tencent.com/cam/capi} */
	secretKey: string;
	/** 存储桶的名称 */
	bucket: string;
	/** 存储桶所在地域 @see {@link https://cloud.tencent.com/document/product/436/6224} */
	region: string;
	/** 自定义 CDN 域名 */
	domain?: string;
	/** 自定义上传路径 */
	uploadPath?: string;
	/** 自定义命中文件规则 */
	include?: string[] | ((path: string) => boolean);
}

export default function Rux({
	include = ['.png', '.jpg', '.jpeg', '.svg', '.gif'],
	bucket,
	region,
	domain = `${bucket}.cos.${region}.myqcloud.com`,
	...options
}: RuxPluginOptions): Plugin {
	// init cos
	const cos = new COS({
		SecretId: options.secretId,
		SecretKey: options.secretKey
	});

	// create .cache.json
	const cachePath = path.join(process.cwd(), '.cache.json');
	let cacheData: Record<string, string> = {};
	if (!fs.existsSync(cachePath) || !fs.readFileSync(cachePath, 'utf-8')) {
		fs.writeFileSync(cachePath, JSON.stringify({}, null, 2), 'utf-8');
	} else {
		cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
	}

	const uploadFile = (file: string) => {
		return new Promise<{
			status: number;
			url: string;
		}>((resolve, reject) => {
			// 获取当前项目名称
			const projectName = path.basename(process.cwd());
			// 获取文件扩展名
			const extName = path.extname(file);
			// 获取当前文件名
			const fileName = path.basename(file, extName);
			// 将无扩展名的文件名转换为md5
			const md5Name = crypto.createHash('md5').update(fileName).digest('hex');
			const fileKey = path.join(options.uploadPath ?? projectName, `${md5Name}${extName}`);
			const fileBody = fs.createReadStream(file);
			const { size: fileSize } = fs.statSync(file);

			if (cacheData[`${md5Name}${extName}`]) {
				console.log(`${md5Name}${extName} => ${file}`);

				return resolve({
					url: domain + fileKey,
					status: 304
				});
			}

			cos.putObject(
				{
					Bucket: bucket,
					Region: region,
					Key: fileKey,
					Body: fileBody,
					ContentLength: fileSize
				},
				(err, data) => {
					if (data?.statusCode === 200) {
						cacheData[`${md5Name}${extName}`] = file;
						fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
						console.log(`${md5Name}${extName} => ${file}`);
						return resolve({
							url: domain + fileKey,
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
				const { status, url } = await uploadFile(normalizedFile);
				if ([304, 200].includes(status)) {
					return `export default '${url}';`;
				}
			}
		}
	};
}
