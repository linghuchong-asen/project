set -e
pnpm docs:build
cd blog
git init
git config user.email '374688995@qq.com'
git add .
git commit -m '发布'
git push -f git@github.com:linghuchong-asen/project.git master:blog