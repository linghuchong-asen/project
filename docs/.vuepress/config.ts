import { defineUserConfig } from "vuepress";
import path from "node:path";
import theme from "./config/theme.js";

import { registerComponentsPlugin } from "@vuepress/plugin-register-components";
import { viteBundler } from "@vuepress/bundler-vite";

export default defineUserConfig({
  base: "/project/",

  lang: "zh-CN",
  title: "项目",

  bundler: viteBundler(),

  head: [["link", { rel: "icon", href: "/project/favicon.ico" }]], // 配置网站图标

  theme,

  shouldPrefetch: false,

  /* 配置打包输出文件位置，相对于根目录 */
  dest: "blog", // 举例：这里输出至根目录下的blog文件夹下

  plugins: [
    registerComponentsPlugin({
      componentsDir: path.resolve(__dirname, "./components"),
    }),
  ],
});
