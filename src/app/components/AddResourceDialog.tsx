import { Plus, X } from "lucide-react";
import { RESOURCE_DEFINITIONS } from "../editor/manifestEditorSchema";
import { useEditorStore } from "../store/editorStore";
import { isDeviceResourceEditable } from "../editor/deviceEditorCapabilities";

interface AddResourceDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddResourceDialog({ open, onClose }: AddResourceDialogProps) {
  const addResource = useEditorStore((state) => state.addResource);
  const device = useEditorStore((state) => state.project.device);
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={onClose}>
      <section className="modal resource-dialog" role="dialog" aria-modal="true" onPointerDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>添加资源</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="resource-dialog-body">
          {(["基础", "数据", "组合"] as const).map((group) => (
            <div className="resource-group" key={group}>
              <h3>{group}</h3>
              <div className="resource-type-grid">
                {RESOURCE_DEFINITIONS.filter((definition) => definition.group === group && isDeviceResourceEditable(device, definition.type)).map((definition) => (
                  <button
                    key={definition.type}
                    className="resource-type-card"
                    onClick={() => {
                      addResource(definition.type);
                      onClose();
                    }}
                  >
                    <span className="resource-type-icon"><Plus size={15} /></span>
                    <strong>{definition.label}</strong>
                    <code>{definition.type}</code>
                    <small>{definition.description}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
