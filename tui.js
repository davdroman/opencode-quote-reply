import { Plugin } from "@opencode/plugin/tui";

// The plugin API has no prompt access, so the prompt is located through
// OpenTUI's renderable tree. Duck typing avoids depending on the host's
// @opentui/core instance for instanceof checks.
const isEditable = (renderable) =>
  renderable != null &&
  !renderable.isDestroyed &&
  typeof renderable.insertText === "function" &&
  typeof renderable.plainText === "string";

function findEditables(renderable, found = []) {
  if (!renderable || renderable.visible === false) return found;
  if (isEditable(renderable)) found.push(renderable);
  for (const child of renderable.getChildren?.() ?? []) findEditables(child, found);
  return found;
}

function findPrompt(renderer) {
  const focused = renderer.currentFocusedRenderable;
  if (isEditable(focused)) return focused;
  const editables = findEditables(renderer.root);
  return editables.length === 1 ? editables[0] : undefined;
}

const quote = (text) =>
  text
    .replace(/\s+$/, "")
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n") + "\n\n";

export default Plugin.define({
  id: "quote-reply",
  setup(context) {
    const keybind = context.options.keybind ?? "ctrl+q";
    if (typeof keybind !== "string" || keybind.trim() === "") {
      throw new TypeError("quote-reply: keybind must be a non-empty shortcut string");
    }

    const renderer = context.renderer;
    // Remember the last finished mouse selection in case the host clears it
    // (for example after copy-on-select) before the command runs.
    let lastSelection = "";
    const onSelection = (selection) => {
      const text = selection?.getSelectedText?.() ?? "";
      if (text.trim()) lastSelection = text;
    };
    renderer.on("selection", onSelection);

    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "quote-reply.run",
        title: "Quote selection into prompt",
        group: "Prompt",
        bind: keybind,
        palette: true,
        enabled: () => context.ui.router.current().type === "session",
        run() {
          const live = renderer.getSelection()?.getSelectedText() ?? "";
          const text = live.trim() ? live : lastSelection;
          if (!text.trim()) {
            context.ui.toast.show({ message: "Select transcript text first.", variant: "warning" });
            return;
          }
          const prompt = findPrompt(renderer);
          if (!prompt) {
            context.ui.toast.show({ message: "Could not find the prompt input.", variant: "error" });
            return;
          }
          prompt.insertText(quote(text));
          if (!prompt.focused) prompt.focus();
          lastSelection = "";
          renderer.clearSelection();
        },
      }],
    }));

    return () => renderer.off("selection", onSelection);
  },
});
