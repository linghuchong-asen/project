/*
 * @Description: vuepress-theme-hope主题配置文件
 * @Author: yangsen
 * @Date: 2022-12-29 17:43:41
 * @LastEditors: yangsen
 * @LastEditTime: 2026-07-31 14:13:24
 */
import { hopeTheme } from "vuepress-theme-hope";
import { navbar_hope } from "./navbar";
import { sidebar_hope } from "./sidebar";

export default hopeTheme({
  hostname: "project",

  author: {
    name: "杨森",
  },

  logo: "/logo-removeBg-preview.png", // 博客左上角的logo

  iconAssets: "iconfont", // 项目中使用的图标设置

  pageInfo: ["Author", "Original", "Date", "Category", "Tag", "ReadingTime"],
  // 主题颜色
  themeColor: {
    blue: "#2196f3",
    red: "#f26d6d",
    green: "#3eaf7c",
    orange: "#fb9b5f",
  },

  // 全屏标识
  fullscreen: true,

  // navbar
  navbar: navbar_hope,
  // 导航栏布局
  navbarLayout: {
    start: ["Brand", "Search"],
    center: [],
    end: ["Links", "Outlook"],
  },

  // sidebar
  sidebar: sidebar_hope,

  footer: "项目",

  displayFooter: true,

  // page meta
  metaLocales: {
    editLink: "在 GitHub 上编辑此页",
  },

  encrypt: {
    config: {
      "/demo/encrypt.html": ["1234"],
      "/zh/demo/encrypt.html": ["1234"],
    },
  },

  markdown: {
    align: true,
    attrs: true,
    codeTabs: true,
    demo: true,
    figure: true,
    gfm: true,
    imgLazyload: true,
    imgSize: true,
    include: true,
    mark: true,
    math: true,
    mermaid: true,
    playground: {
      presets: ["ts", "vue"],
    },
    stylize: [
      {
        matcher: "Recommended",
        replacer: ({ tag }) => {
          if (tag === "em")
            return {
              tag: "Badge",
              attrs: { type: "tip" },
              content: "Recommended",
            };
        },
      },
    ],
    sub: true,
    sup: true,
    tabs: true,
    vPre: true,
  },

  plugins: {
    slimsearch: {
      indexContent: true,
      hotKeys: [
        {
          key: "k",
          ctrl: true,
        },
      ],
      locales: {
        "/": {
          placeholder: "搜索 Ctrl + K",
        },
      },
    },
  },
});
