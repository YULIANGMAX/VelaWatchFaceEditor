export type DialogType = "confirm" | "prompt" | "alert";

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export interface PromptDialogOptions {
  title?: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  validate?: (value: string) => string | null | undefined;
}

export interface AlertDialogOptions {
  title?: string;
  message: string;
  type?: "info" | "warning" | "error" | "success";
  confirmText?: string;
}

type DialogState =
  | {
      type: "confirm";
      options: ConfirmDialogOptions;
      resolve: (value: boolean) => void;
    }
  | {
      type: "prompt";
      options: PromptDialogOptions;
      resolve: (value: string | null) => void;
    }
  | {
      type: "alert";
      options: AlertDialogOptions;
      resolve: () => void;
    }
  | null;

let currentDialogState: DialogState = null;
const listeners = new Set<(state: DialogState) => void>();

function notify() {
  listeners.forEach((listener) => listener(currentDialogState));
}

export const dialogManager = {
  subscribe(listener: (state: DialogState) => void) {
    listeners.add(listener);
    listener(currentDialogState);
    return () => {
      listeners.delete(listener);
    };
  },

  getState() {
    return currentDialogState;
  },

  confirm(options: ConfirmDialogOptions | string): Promise<boolean> {
    const opts: ConfirmDialogOptions = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      currentDialogState = {
        type: "confirm",
        options: opts,
        resolve: (val) => {
          currentDialogState = null;
          notify();
          resolve(val);
        },
      };
      notify();
    });
  },

  prompt(options: PromptDialogOptions | string): Promise<string | null> {
    const opts: PromptDialogOptions = typeof options === "string" ? { message: options } : options;
    return new Promise<string | null>((resolve) => {
      currentDialogState = {
        type: "prompt",
        options: opts,
        resolve: (val) => {
          currentDialogState = null;
          notify();
          resolve(val);
        },
      };
      notify();
    });
  },

  alert(options: AlertDialogOptions | string): Promise<void> {
    const opts: AlertDialogOptions = typeof options === "string" ? { message: options } : options;
    return new Promise<void>((resolve) => {
      currentDialogState = {
        type: "alert",
        options: opts,
        resolve: () => {
          currentDialogState = null;
          notify();
          resolve();
        },
      };
      notify();
    });
  },
};
