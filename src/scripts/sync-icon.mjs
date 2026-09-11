import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

const svgPath = path.join(srcDir, 'public', 'favicon.svg');
const iconsDir = path.join(srcDir, 'src-tauri', 'icons');
const icoPath = path.join(iconsDir, 'icon.ico');
const cacheDir = path.join(srcDir, 'node_modules', '.cache');
const hashFilePath = path.join(cacheDir, 'favicon.hash');

function getSvgHash() {
  if (!fs.existsSync(svgPath)) {
    return null;
  }
  const content = fs.readFileSync(svgPath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function removeMobileIcons() {
  const mobileDirs = ['android', 'ios'];
  for (const dir of mobileDirs) {
    const target = path.join(iconsDir, dir);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}

function sync() {
  const currentHash = getSvgHash();
  if (!currentHash) {
    console.warn('[icon-sync] Warning: public/favicon.svg not found.');
    return;
  }

  let cachedHash = null;
  if (fs.existsSync(hashFilePath)) {
    try {
      cachedHash = fs.readFileSync(hashFilePath, 'utf8').trim();
    } catch {
      cachedHash = null;
    }
  }

  if (cachedHash === currentHash && fs.existsSync(icoPath)) {
    // 图标源文件未改动，跳过生成，避免 icon.icns 等产生无谓 diff
    return;
  }

  console.log('[icon-sync] public/favicon.svg 已变更或图标缺失，重新生成桌面图标...');
  execSync('npx tauri icon public/favicon.svg', {
    cwd: srcDir,
    stdio: 'inherit',
  });

  // 剔除移动端专属图标目录（本项目为纯桌面应用）
  removeMobileIcons();

  // 记录哈希缓存
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  fs.writeFileSync(hashFilePath, currentHash, 'utf8');
  console.log('[icon-sync] 桌面图标同步完成（已移除 android / ios 目录）。');
}

sync();
