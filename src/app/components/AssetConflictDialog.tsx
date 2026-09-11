import { FileImage, X } from "lucide-react";
import type { ProjectAsset } from "../core/model";
import type { AssetImportCandidate } from "../core/projectIO";

export interface AssetConflict {
  path: string;
  existing: ProjectAsset;
  existingSource: string;
  incoming: AssetImportCandidate;
}

function isImage(asset: ProjectAsset): boolean {
  return asset.blob.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(asset.path);
}

function modifiedTime(asset: ProjectAsset): string {
  const value = asset.lastModified ?? (asset.blob instanceof File ? asset.blob.lastModified : 0);
  return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(value) : "未知";
}

function FileChoice({ asset, source, label }: { asset: ProjectAsset; source: string; label: string }) {
  return (
    <article className="asset-conflict-choice">
      <strong>{label}</strong>
      <div className="asset-conflict-preview">
        {isImage(asset) ? <img src={asset.url} alt={asset.path} /> : <FileImage size={32} />}
      </div>
      <dl>
        <div><dt>文件来源</dt><dd title={source}>{source}</dd></div>
        <div><dt>修改时间</dt><dd>{modifiedTime(asset)}</dd></div>
        <div><dt>文件大小</dt><dd>{asset.blob.size.toLocaleString("zh-CN")} B</dd></div>
      </dl>
    </article>
  );
}

export function AssetConflictDialog({
  conflict,
  index,
  total,
  onKeepExisting,
  onUseIncoming,
  onCancel,
}: {
  conflict: AssetConflict | null;
  index: number;
  total: number;
  onKeepExisting: () => void;
  onUseIncoming: () => void;
  onCancel: () => void;
}) {
  if (!conflict) return null;
  return (
    <div className="modal-backdrop" onPointerDown={onCancel}>
      <section className="modal asset-conflict-dialog" onPointerDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header className="modal-header">
          <h2>资源文件已存在（{index + 1}/{total}）</h2>
          <button className="icon-button" onClick={onCancel} title="取消导入"><X size={18} /></button>
        </header>
        <p>目标路径 <code>resources/{conflict.path}</code> 已有文件，请选择保留版本。</p>
        <div className="asset-conflict-choices">
          <FileChoice asset={conflict.existing} source={conflict.existingSource} label="现有文件" />
          <FileChoice asset={conflict.incoming.asset} source={conflict.incoming.sourcePath} label="导入文件" />
        </div>
        <footer>
          <button className="secondary-button" onClick={onKeepExisting}>保留现有文件</button>
          <button className="primary-button" onClick={onUseIncoming}>使用导入文件</button>
        </footer>
      </section>
    </div>
  );
}
