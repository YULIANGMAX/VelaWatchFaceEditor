import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

const packageJsonPath = path.join(srcDir, 'package.json');
const packageLockPath = path.join(srcDir, 'package-lock.json');
const tauriConfPath = path.join(srcDir, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(srcDir, 'src-tauri', 'Cargo.toml');
const cargoLockPath = path.join(srcDir, 'src-tauri', 'Cargo.lock');

function readPackageJson() {
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`找不到 package.json: ${packageJsonPath}`);
  }
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function syncVersion(specifiedVersion) {
  const pkg = readPackageJson();
  let version = specifiedVersion || pkg.version;

  if (specifiedVersion && specifiedVersion !== pkg.version) {
    pkg.version = specifiedVersion;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    console.log(`[version-sync] 已更新 package.json 版本为 v${specifiedVersion}`);
  }

  if (!version) {
    throw new Error('未在 package.json 中找到版本号');
  }

  const updatedFiles = [];

  // 1. 同步 package-lock.json
  if (fs.existsSync(packageLockPath)) {
    const original = fs.readFileSync(packageLockPath, 'utf8');
    try {
      const lock = JSON.parse(original);
      let changed = false;
      if (lock.version !== version) {
        lock.version = version;
        changed = true;
      }
      if (lock.packages && lock.packages[''] && lock.packages[''].version !== version) {
        lock.packages[''].version = version;
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(packageLockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
        updatedFiles.push('package-lock.json');
      }
    } catch {
      // 容错处理：若 JSON 解析异常则跳过
    }
  }

  // 2. 同步 tauri.conf.json
  if (fs.existsSync(tauriConfPath)) {
    const original = fs.readFileSync(tauriConfPath, 'utf8');
    let updated = original.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${version}"`);
    updated = updated.replace(/"title"\s*:\s*"Vela 表盘编辑器[^"]*"/, `"title": "Vela 表盘编辑器 v${version}"`);
    if (updated !== original) {
      fs.writeFileSync(tauriConfPath, updated, 'utf8');
      updatedFiles.push('tauri.conf.json');
    }
  }

  // 3. 同步 Cargo.toml
  if (fs.existsSync(cargoTomlPath)) {
    const original = fs.readFileSync(cargoTomlPath, 'utf8');
    const updated = original.replace(/(^\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m, `$1"${version}"`);
    if (updated !== original) {
      fs.writeFileSync(cargoTomlPath, updated, 'utf8');
      updatedFiles.push('Cargo.toml');
    }
  }

  // 4. 同步 Cargo.lock
  if (fs.existsSync(cargoLockPath)) {
    const original = fs.readFileSync(cargoLockPath, 'utf8');
    const updated = original.replace(/(^\[\[package\]\]\r?\nname\s*=\s*"app"\r?\nversion\s*=\s*)"[^"]+"/m, `$1"${version}"`);
    if (updated !== original) {
      fs.writeFileSync(cargoLockPath, updated, 'utf8');
      updatedFiles.push('Cargo.lock');
    }
  }

  if (updatedFiles.length > 0) {
    console.log(`[version-sync] 已将版本号 v${version} 自动同步至: ${updatedFiles.join(', ')}`);
  }
}

const inputVersion = process.argv[2];
syncVersion(inputVersion);
