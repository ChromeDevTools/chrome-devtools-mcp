#!/bin/bash

echo "========================================="
echo "Chrome DevTools MCP 自動検出機能テスト"
echo "========================================="
echo ""

echo "1. 拡張機能ディレクトリの確認："
if [ -d "./extensions" ]; then
    echo "✅ extensions/ ディレクトリ存在"
    echo "   検出された拡張機能："
    for dir in ./extensions/*/; do
        if [ -f "$dir/manifest.json" ]; then
            name=$(basename "$dir")
            echo "   - $name"
        fi
    done
else
    echo "❌ extensions/ ディレクトリなし"
fi
echo ""

echo "2. Chromeブックマークファイルの確認："
BOOKMARKS_PATH="$HOME/Library/Application Support/Google/Chrome/Default/Bookmarks"
if [ -f "$BOOKMARKS_PATH" ]; then
    count=$(cat "$BOOKMARKS_PATH" | grep -o '"url"' | wc -l)
    echo "✅ Chromeブックマーク存在: $count 個"
else
    echo "❌ Chromeブックマークファイルなし"
fi
echo ""

echo "3. システムChromeプロファイルの確認："
CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome"
if [ -d "$CHROME_PROFILE" ]; then
    echo "✅ システムChromeプロファイル存在: $CHROME_PROFILE"
else
    echo "❌ システムChromeプロファイルなし"
fi
echo ""

echo "4. MCPサーバーの起動テスト（3秒間）："
echo "   起動メッセージ確認中..."
timeout 3 node build/src/index.js 2>&1 | head -20 | while IFS= read -r line; do
    echo "   > $line"
done
echo ""

echo "========================================="
echo "テスト完了"
echo "========================================="