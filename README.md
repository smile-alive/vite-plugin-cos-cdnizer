# vite-plugin-static-cdnizer

> 在日常开发中，经常需要将静态资源上传到云服务的对象存储中。传统方式需要开发者手动登录云服务器控制台进行上传，步骤繁琐。使用本插件后，开发者可以将静态资源放置在项目本地，插件将自动将这些资源上传到对象存储中。同时，插件会自动替换代码中的 `import xxx from 'xxx.png'` 为 CDN 地址，简化了开发流程，提高了效率。

## 安装

```base
npm install vite-plugin-static-cdnizer -D
```

## 基本使用

```ts
import { defineConfig } from 'vite';
import cdnizer from 'vite-plugin-static-cdnizer';

export default defineConfig({
	plugins: [
		cdnizer({
			secretId: 'yourSecretId',
			secretKey: 'yourSecretKey',
			bucket: 'yourBucket',
			region: 'yourRegion',
			domain: 'yourCustomCDNDomain'
		})
	]
});
```

<br>

![success](https://static.rux.ink/uPic/success.gif)

> 已上传的文件会自动创建 `.cache.json` 进行记录，以便减少无用上传。

![cache](https://static.rux.ink/uPic/cache.gif)

## 参数配置

| 参数名            | 类型                                  | 描述                              | 默认值                                      | 必填 |
| ----------------- | ------------------------------------- | --------------------------------- | ------------------------------------------- | ---- |
| secretId          | string                                | 身份密钥 ID                       | -                                           | 是   |
| secretKey         | string                                | 身份密钥 Key                      | -                                           | 是   |
| bucket            | string                                | 存储桶的名称                      | -                                           | 是   |
| region            | string                                | 存储桶所在地域                    | -                                           | 是   |
| domain            | string                                | 自定义 CDN 域名                   | `${bucket}.cos.${region}.myqcloud.com`      | 否   |
| uploadPath        | string                                | 自定义上传路径                    | `${projectName}/${fileName}`                | 否   |
| include           | string[] 或 (path: string) => boolean | 自定义命中文件规则                | `['.png', '.jpg', '.jpeg', '.svg', '.gif']` | 否   |
| enableMD5FileName | boolean                               | 是否对上传的文件名称进行 MD5 编码 | `true`                                      | 否   |
| enableCache       | boolean                               | 是否缓存已上传文件                | `true`                                      | 否   |
