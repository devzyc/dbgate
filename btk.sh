#!/bin/bash
# DbGate 快速启动脚本
# 用法：在项目根目录下执行 ./btk.sh

set -e  # 任何命令返回非零即退出

echo "🧹 Step 1: 清理旧构建..."
rm -rf packages/web/public/build

echo "🔨 Step 2: 编译 Web 端..."
yarn build:web

echo "🚀 Step 3: 启动应用（API + Web）..."
yarn start

# 如果 yarn start 正常启动，它会进入前台阻塞状态；
# 若启动失败（如端口占用），则脚本会因 set -e 而立即退出。