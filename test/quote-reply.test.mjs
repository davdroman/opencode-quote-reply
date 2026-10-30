import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// OpenCode supplies the TUI runtime. Only its identity wrapper is needed here.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@opencode/plugin/tui") {
      return {
        url: "data:text/javascript,export const Plugin = { define: value => value };",
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});
const { default: plugin } = await import("opencode-quote-reply/tui");
hooks.deregister();

function editable(text = "") {
  return {
    plainText: text,
    focused: false,
    insertText(value) { this.plainText += value; },
    focus() { this.focused = true; },
    getChildren: () => [],
  };
}

function box(...children) {
  return { getChildren: () => children };
}

function setup({ options = { keybind: "ctrl+q" }, root = box(), focused = null } = {}) {
  let route = { type: "session", sessionID: "ses_first" };
  let selection = null;
  const listeners = new Set();
  const toasts = [];
  const renderer = {
    root,
    currentFocusedRenderable: focused,
    on: (event, listener) => event === "selection" && listeners.add(listener),
    off: (event, listener) => event === "selection" && listeners.delete(listener),
    getSelection: () => selection,
    clearSelection: () => { selection = null; },
  };
  let layer;
  const cleanup = plugin.setup({
    options,
    renderer,
    keymap: { layer: (factory) => { layer = factory(); } },
    ui: {
      router: { current: () => route },
      toast: { show: (toast) => toasts.push(toast) },
    },
  });
  const select = (text) => {
    selection = { getSelectedText: () => text };
    for (const listener of listeners) listener(selection);
  };
  return {
    action: layer.commands[0],
    cleanup,
    listeners,
    navigate: (next) => { route = next; },
    renderer,
    select,
    toasts,
  };
}

test("quotes the selection into the focused prompt", () => {
  const prompt = editable("Re: ");
  prompt.focused = true;
  const { action, select, renderer } = setup({ focused: prompt });
  select("first line\n\nsecond line\n");
  action.run();
  assert.equal(prompt.plainText, "Re: > first line\n>\n> second line\n\n");
  assert.equal(renderer.getSelection(), null);
});

test("finds and focuses the only prompt when it is not focused", () => {
  const prompt = editable();
  const { action, select } = setup({ root: box(box(prompt), { visible: false, getChildren: () => [editable()] }) });
  select("text");
  action.run();
  assert.equal(prompt.plainText, "> text\n\n");
  assert.equal(prompt.focused, true);
});

test("uses the last finished selection after the host clears it", () => {
  const prompt = editable();
  const { action, select, renderer } = setup({ focused: prompt });
  select("kept");
  renderer.clearSelection();
  action.run();
  assert.equal(prompt.plainText, "> kept\n\n");
  action.run();
  assert.equal(prompt.plainText, "> kept\n\n", "a selection is quoted once");
});

test("reports a missing selection or prompt without inserting", () => {
  const prompt = editable();
  const empty = setup({ focused: prompt });
  empty.action.run();
  assert.equal(empty.toasts[0].variant, "warning");

  const ambiguous = setup({ root: box(editable(), editable()) });
  ambiguous.select("text");
  ambiguous.action.run();
  assert.equal(ambiguous.toasts[0].variant, "error");
});

test("is enabled only in sessions", () => {
  const { action, navigate } = setup();
  assert.equal(action.enabled(), true);
  navigate({ type: "home" });
  assert.equal(action.enabled(), false);
});

test("binds the configured shortcut and stops listening on cleanup", () => {
  const { action, cleanup, listeners } = setup({ options: { keybind: "<leader>q" } });
  assert.equal(action.bind, "<leader>q");
  cleanup();
  assert.equal(listeners.size, 0);
});

test("defaults to ctrl+q", () => {
  assert.equal(setup({ options: {} }).action.bind, "ctrl+q");
});

test("rejects keybind values that are not non-empty strings", () => {
  for (const keybind of [false, 42, [], {}, "", "   "]) {
    assert.throws(() => setup({ options: { keybind } }), /keybind must be a non-empty shortcut string/);
  }
});
