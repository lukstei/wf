#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/cli.ts
var cli_exports = {};
__export(cli_exports, {
  getCliHelp: () => getCliHelp,
  parseCliArgs: () => parseCliArgs,
  runCli: () => runCli
});
module.exports = __toCommonJS(cli_exports);
var import_node_util = require("node:util");

// src/lib/getLatestMessage.ts
var fs = __toESM(require("node:fs"), 1);
function defaultTranscriptParser(item) {
  const isUser = item.type === "USER_INPUT" || item.source === "USER_EXPLICIT";
  const isModel = (item.type === "PLANNER_RESPONSE" || item.source === "MODEL") && item.type !== "GENERIC";
  if ((isUser || isModel) && typeof item.content === "string") {
    return {
      stepIndex: typeof item.step_index === "number" ? item.step_index : 0,
      type: isUser ? "USER_INPUT" : "PLANNER_RESPONSE",
      source: typeof item.source === "string" ? item.source : void 0,
      content: item.content
    };
  }
  return null;
}
function getLatestMessage(transcriptPath, parseItem = defaultTranscriptParser) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return null;
  }
  try {
    const stat = fs.statSync(transcriptPath);
    const readSize = Math.min(stat.size, 256 * 1024);
    const buffer = Buffer.alloc(readSize);
    const fd = fs.openSync(transcriptPath, "r");
    fs.readSync(fd, buffer, 0, readSize, stat.size - readSize);
    fs.closeSync(fd);
    const chunk = buffer.toString("utf-8");
    const lines = chunk.split("\n").filter((l) => l.trim().length > 0);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const item = JSON.parse(lines[i]);
        if (item && typeof item === "object") {
          const parsed = parseItem(item);
          if (parsed) {
            return parsed;
          }
        }
      } catch {
      }
    }
  } catch {
  }
  return null;
}

// src/harnesses/agy.ts
var agyHarness = {
  id: "agy",
  detect(payload, env) {
    if (env.AGY_HOOK_ACTIVE) {
      return true;
    }
    if (Array.isArray(payload.workspacePaths) || payload.executionNum !== void 0 || payload.stepIdx !== void 0 || payload.invocationNum !== void 0 || payload.artifactDirectoryPath !== void 0) {
      return true;
    }
    if (payload.conversationId !== void 0 && !payload.session_id) {
      return true;
    }
    return false;
  },
  normalize(payload, modeArg, env = process.env) {
    const conversationId = String(payload.conversationId ?? "default");
    const workspacePaths = Array.isArray(payload.workspacePaths) ? payload.workspacePaths : void 0;
    const workspacePath = String(
      workspacePaths?.[0] ?? payload.cwd ?? env.PWD ?? "."
    );
    const terminationReason = typeof payload.terminationReason === "string" ? payload.terminationReason : void 0;
    const isStop = modeArg === "stop" || Boolean(terminationReason && payload.invocationNum === void 0);
    const isTool = modeArg === "tool" || payload.toolCall !== void 0;
    const type = isStop ? "stop" : isTool ? "tool" : "pre";
    const prompt = typeof payload.prompt === "string" ? payload.prompt : void 0;
    const isInterrupted = Boolean(
      terminationReason && /cancel|abort|interrupt/i.test(terminationReason)
    );
    const stopHookActive = Boolean(
      typeof payload.executionNum === "number" && payload.executionNum > 1
    );
    const rawToolCall = payload.toolCall;
    const toolCall = isTool && rawToolCall ? {
      name: String(rawToolCall.name ?? "unknown"),
      args: rawToolCall.args ?? {}
    } : void 0;
    const partialEvent = {
      type,
      harness: "agy",
      conversationId,
      workspacePath,
      prompt,
      toolCall,
      isStop,
      stopHookActive,
      terminationReason,
      isInterrupted,
      latestMessage: null,
      rawPayload: payload
    };
    partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
    return partialEvent;
  },
  extractLatestMessage(event) {
    const invocationNum = typeof event.rawPayload.invocationNum === "number" ? event.rawPayload.invocationNum : void 0;
    if (event.type === "pre" && invocationNum !== void 0 && invocationNum > 1) {
      return null;
    }
    const rawTranscript = event.rawPayload.transcriptPath ?? event.rawPayload.transcript_path;
    if (typeof rawTranscript === "string") {
      const msg = getLatestMessage(rawTranscript, defaultTranscriptParser);
      if (msg) return msg;
    }
    if (event.type === "stop") {
      const rawAssistant = event.rawPayload.last_assistant_message ?? event.rawPayload.lastAssistantMessage;
      if (typeof rawAssistant === "string" && rawAssistant.length > 0) {
        return {
          stepIndex: 0,
          type: "PLANNER_RESPONSE",
          content: rawAssistant
        };
      }
    }
    if (event.prompt) {
      return {
        stepIndex: 0,
        type: "USER_INPUT",
        content: event.prompt
      };
    }
    return null;
  },
  formatEgress(event, response) {
    if (event.type === "stop") {
      if (response.decision === "continue" && response.reason) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            decision: "continue",
            reason: response.reason
          })
        };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({ decision: "allow" })
      };
    }
    if (event.type === "pre") {
      const ephemeralMessage = response.injectSteps?.[0]?.ephemeralMessage || response.message || "";
      if (!ephemeralMessage) {
        return { exitCode: 0, stdout: "{}" };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          injectSteps: [{ ephemeralMessage }]
        })
      };
    }
    if (event.type === "tool") {
      const isDeny = response.decision === "deny";
      const reason = response.reason || "Action blocked by workflow policy.";
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          decision: isDeny ? "deny" : "allow",
          ...isDeny ? { reason } : {},
          ...response.overwrite ? { overwrite: response.overwrite } : {}
        })
      };
    }
    return { exitCode: 0, stdout: JSON.stringify(response) };
  },
  resolveConversationId(env) {
    return env.ANTIGRAVITY_CONVERSATION_ID || env.AGY_CONVERSATION_ID || null;
  },
  resolveStorageDir(env) {
    return env.AGY_PLUGIN_DATA || null;
  }
};

// src/harnesses/copilot.ts
function isVsCodeCopilotRoot(pluginRoot) {
  if (!pluginRoot) return false;
  const segments = pluginRoot.split(/[\\/]+/);
  return segments.includes("agent-plugins") && pluginRoot.toLowerCase().includes(".vscode");
}
var copilotHarness = {
  id: "copilot",
  detect(_payload, env) {
    return Boolean(
      env.COPILOT_PLUGIN_DATA || isVsCodeCopilotRoot(env.CLAUDE_PLUGIN_ROOT)
    );
  },
  normalize(payload, modeArg, env = process.env) {
    const conversationId = String(
      payload.sessionId ?? payload.session_id ?? payload.conversationId ?? "default"
    );
    const workspacePath = String(payload.cwd ?? env.PWD ?? ".");
    const eventName = payload.hook_event_name ?? payload.hookEventName;
    const isStop = modeArg === "stop" || eventName === "Stop" || payload.stop_hook_active !== void 0 || payload.stopHookActive !== void 0;
    const isTool = modeArg === "tool" || eventName === "PreToolUse" || payload.tool_name !== void 0 || payload.toolName !== void 0;
    const type = isStop ? "stop" : isTool ? "tool" : "pre";
    const prompt = typeof payload.prompt === "string" ? payload.prompt : typeof payload.initial_prompt === "string" ? payload.initial_prompt : typeof payload.initialPrompt === "string" ? payload.initialPrompt : void 0;
    const stopHookActive = Boolean(
      payload.stop_hook_active ?? payload.stopHookActive
    );
    const rawToolName = payload.tool_name ?? payload.toolName;
    const rawToolArgs = payload.tool_input ?? payload.toolArgs;
    const toolCall = isTool && rawToolName ? {
      name: String(rawToolName),
      args: rawToolArgs ?? {}
    } : void 0;
    const partialEvent = {
      type,
      harness: "copilot",
      conversationId,
      workspacePath,
      prompt,
      toolCall,
      isStop,
      stopHookActive,
      isInterrupted: false,
      latestMessage: null,
      rawPayload: payload
    };
    partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
    return partialEvent;
  },
  extractLatestMessage(event) {
    if (event.type === "stop") {
      const raw = event.rawPayload.last_assistant_message ?? event.rawPayload.lastAssistantMessage;
      if (typeof raw === "string" && raw.length > 0) {
        return {
          stepIndex: 0,
          type: "PLANNER_RESPONSE",
          content: raw
        };
      }
      const transcript = event.rawPayload.transcript_path ?? event.rawPayload.transcriptPath;
      if (typeof transcript === "string") {
        return getLatestMessage(transcript, parseClaudeMessage);
      }
      return null;
    }
    if (event.prompt) {
      return {
        stepIndex: 0,
        type: "USER_INPUT",
        content: event.prompt
      };
    }
    return null;
  },
  formatEgress(event, response) {
    if (event.type === "stop") {
      if (response.decision === "continue" && response.reason) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            decision: "block",
            reason: response.reason
          })
        };
      }
      return { exitCode: 0, stdout: "{}" };
    }
    if (event.type === "pre") {
      const ephemeralMessage = response.injectSteps?.[0]?.ephemeralMessage || response.message || "";
      if (!ephemeralMessage) {
        return { exitCode: 0, stdout: "{}" };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          additionalContext: ephemeralMessage
        })
      };
    }
    if (event.type === "tool") {
      const isDeny = response.decision === "deny";
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          permissionDecision: isDeny ? "deny" : "allow",
          permissionDecisionReason: isDeny ? response.reason || "Action blocked by workflow policy." : ""
        })
      };
    }
    return { exitCode: 0, stdout: JSON.stringify(response) };
  },
  resolveConversationId(env) {
    return env.COPILOT_CONVERSATION_ID || env.VSCODE_COPILOT_SESSION_ID || null;
  },
  resolveStorageDir(env) {
    return env.COPILOT_PLUGIN_DATA || null;
  }
};

// src/harnesses/claude.ts
function parseClaudeMessage(item) {
  if (item.role === "assistant" || item.message?.role === "assistant") {
    const msg = item.message ?? item;
    if (Array.isArray(msg.content)) {
      const textBlock = msg.content.find((c) => c.type === "text");
      if (typeof textBlock?.text === "string") {
        return {
          stepIndex: 0,
          type: "PLANNER_RESPONSE",
          content: textBlock.text
        };
      }
    }
  }
  if (item.role === "user" && typeof item.content === "string") {
    return {
      stepIndex: 0,
      type: "USER_INPUT",
      content: item.content
    };
  }
  return null;
}
var claudeHarness = {
  id: "claude",
  detect(payload, env) {
    if (isVsCodeCopilotRoot(env.CLAUDE_PLUGIN_ROOT)) {
      return false;
    }
    return Boolean(
      env.CLAUDE_PROJECT_DIR || env.CLAUDE_PLUGIN_ROOT && !env.PLUGIN_DATA || payload.hook_event_name !== void 0 || payload.stop_hook_active !== void 0 || payload.session_id !== void 0
    );
  },
  normalize(payload, modeArg, env = process.env) {
    const conversationId = String(payload.session_id ?? "default");
    const workspacePath = String(payload.cwd ?? env.PWD ?? ".");
    const eventName = payload.hook_event_name;
    const isStop = modeArg === "stop" || eventName === "Stop" || payload.stop_hook_active !== void 0;
    const isTool = modeArg === "tool" || eventName === "PreToolUse" || payload.tool_name !== void 0;
    const type = isStop ? "stop" : isTool ? "tool" : "pre";
    const prompt = typeof payload.prompt === "string" ? payload.prompt : void 0;
    const stopHookActive = Boolean(payload.stop_hook_active);
    const toolCall = isTool ? {
      name: String(payload.tool_name ?? "unknown"),
      args: payload.tool_input ?? {}
    } : void 0;
    const partialEvent = {
      type,
      harness: "claude",
      conversationId,
      workspacePath,
      prompt,
      toolCall,
      isStop,
      stopHookActive,
      isInterrupted: false,
      latestMessage: null,
      rawPayload: payload
    };
    partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
    return partialEvent;
  },
  extractLatestMessage(event) {
    if (event.type === "stop") {
      const raw = event.rawPayload.last_assistant_message ?? event.rawPayload.lastAssistantMessage;
      if (typeof raw === "string" && raw.length > 0) {
        return {
          stepIndex: 0,
          type: "PLANNER_RESPONSE",
          content: raw
        };
      }
      const transcript = event.rawPayload.transcript_path ?? event.rawPayload.transcriptPath;
      if (typeof transcript === "string") {
        return getLatestMessage(transcript, parseClaudeMessage);
      }
      return null;
    }
    if (event.prompt) {
      return {
        stepIndex: 0,
        type: "USER_INPUT",
        content: event.prompt
      };
    }
    return null;
  },
  formatEgress(event, response) {
    if (event.type === "stop") {
      if (response.decision === "continue" && response.reason) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            decision: "block",
            reason: response.reason
          })
        };
      }
      return { exitCode: 0, stdout: "{}" };
    }
    if (event.type === "pre") {
      const text = response.injectSteps?.[0]?.ephemeralMessage || response.message || "";
      if (!text) {
        return { exitCode: 0, stdout: "{}" };
      }
      const hookEventName = typeof event.rawPayload.hook_event_name === "string" ? event.rawPayload.hook_event_name : "UserPromptSubmit";
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          hookSpecificOutput: {
            hookEventName,
            additionalContext: text
          }
        })
      };
    }
    if (event.type === "tool") {
      if (response.decision === "deny") {
        return {
          exitCode: 2,
          stderr: response.reason || "Action blocked by workflow policy."
        };
      }
      return { exitCode: 0 };
    }
    return { exitCode: 0, stdout: JSON.stringify(response) };
  },
  resolveConversationId(env) {
    return env.CLAUDE_CONVERSATION_ID || env.CLAUDE_SESSION_ID || null;
  },
  resolveStorageDir(env) {
    return env.CLAUDE_PLUGIN_DATA || null;
  }
};

// src/harnesses/codex.ts
var codexHarness = {
  id: "codex",
  detect(payload, env) {
    if (isVsCodeCopilotRoot(env.CLAUDE_PLUGIN_ROOT)) {
      return false;
    }
    return Boolean(
      env.PLUGIN_DATA || env.CODEX_SESSION_ID || env.CODEX_THREAD_ID || payload.hookEventName !== void 0
    );
  },
  normalize(payload, modeArg, env = process.env) {
    const conversationId = String(
      payload.session_id ?? payload.sessionId ?? "default"
    );
    const workspacePath = String(payload.cwd ?? env.PWD ?? ".");
    const eventName = payload.hook_event_name ?? payload.hookEventName;
    const isStop = modeArg === "stop" || eventName === "Stop" || payload.stop_hook_active !== void 0 || payload.stopHookActive !== void 0;
    const isTool = modeArg === "tool" || eventName === "PreToolUse" || payload.tool_name !== void 0 || payload.toolName !== void 0;
    const type = isStop ? "stop" : isTool ? "tool" : "pre";
    const prompt = typeof payload.prompt === "string" ? payload.prompt : void 0;
    const stopHookActive = Boolean(
      payload.stop_hook_active ?? payload.stopHookActive
    );
    const toolCall = isTool ? {
      name: String(payload.tool_name ?? payload.toolName ?? "unknown"),
      args: payload.tool_input ?? payload.toolArgs ?? {}
    } : void 0;
    const partialEvent = {
      type,
      harness: "codex",
      conversationId,
      workspacePath,
      prompt,
      toolCall,
      isStop,
      stopHookActive,
      isInterrupted: false,
      latestMessage: null,
      rawPayload: payload
    };
    partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
    return partialEvent;
  },
  extractLatestMessage(event) {
    if (event.type === "stop") {
      const raw = event.rawPayload.last_assistant_message ?? event.rawPayload.lastAssistantMessage;
      if (typeof raw === "string" && raw.length > 0) {
        return {
          stepIndex: 0,
          type: "PLANNER_RESPONSE",
          content: raw
        };
      }
      const transcript = event.rawPayload.transcript_path ?? event.rawPayload.transcriptPath;
      if (typeof transcript === "string") {
        return getLatestMessage(transcript, parseClaudeMessage);
      }
      return null;
    }
    if (event.prompt) {
      return {
        stepIndex: 0,
        type: "USER_INPUT",
        content: event.prompt
      };
    }
    return null;
  },
  formatEgress(event, response) {
    if (event.type === "stop") {
      if (response.decision === "continue" && response.reason) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            decision: "block",
            reason: response.reason,
            suppressOutput: true
          })
        };
      }
      return { exitCode: 0, stdout: "{}" };
    }
    if (event.type === "pre") {
      const text = response.injectSteps?.[0]?.ephemeralMessage || response.message || "";
      if (!text) {
        return { exitCode: 0, stdout: "{}" };
      }
      const hookEventName = typeof event.rawPayload.hook_event_name === "string" ? event.rawPayload.hook_event_name : typeof event.rawPayload.hookEventName === "string" ? event.rawPayload.hookEventName : "UserPromptSubmit";
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          systemMessage: "[WORKFLOW]",
          hookSpecificOutput: {
            hookEventName,
            additionalContext: text
          },
          suppressOutput: true
        })
      };
    }
    if (event.type === "tool") {
      const isDeny = response.decision === "deny";
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: isDeny ? "deny" : "allow",
            permissionDecisionReason: isDeny ? response.reason || "Action blocked by workflow policy." : ""
          }
        })
      };
    }
    return { exitCode: 0, stdout: JSON.stringify(response) };
  },
  resolveConversationId(env) {
    return env.CODEX_CONVERSATION_ID || env.CODEX_SESSION_ID || null;
  },
  resolveStorageDir(env) {
    return env.PLUGIN_DATA || null;
  }
};

// src/harnesses/index.ts
var HARNESSES = [
  copilotHarness,
  codexHarness,
  claudeHarness,
  agyHarness
];
function detectHarness(payload = {}, env = process.env) {
  for (const harness of HARNESSES) {
    if (harness.detect(payload, env)) {
      return harness.id;
    }
  }
  return null;
}
function getHarness(type) {
  switch (type) {
    case "codex":
      return codexHarness;
    case "claude":
      return claudeHarness;
    case "agy":
      return agyHarness;
    case "copilot":
      return copilotHarness;
  }
}
function resolveConversationIdFromHarnesses(env = process.env) {
  for (const harness of HARNESSES) {
    const conversationId = harness.resolveConversationId?.(env);
    if (conversationId) {
      return conversationId;
    }
  }
  return null;
}
function resolveStorageDirFromHarnesses(env = process.env) {
  for (const harness of HARNESSES) {
    const dir = harness.resolveStorageDir?.(env);
    if (dir) {
      return dir;
    }
  }
  return null;
}

// src/lib/logDebug.ts
var fs3 = __toESM(require("node:fs"), 1);
var path2 = __toESM(require("node:path"), 1);

// src/state.ts
var fs2 = __toESM(require("node:fs"), 1);
var os = __toESM(require("node:os"), 1);
var path = __toESM(require("node:path"), 1);
function getStorageBaseDir(env = process.env) {
  return resolveStorageDirFromHarnesses(env) || path.join(os.tmpdir(), "wf");
}
function getStatePath(conversationId, env) {
  return path.join(getStorageBaseDir(env), conversationId, "state.json");
}
function getWorkflowPath(conversationId, env) {
  return path.join(getStorageBaseDir(env), conversationId, "workflow.json");
}
function getDebugLogPath(conversationId, env) {
  const base = getStorageBaseDir(env);
  return conversationId ? path.join(base, conversationId, "debug.log") : path.join(base, "debug.log");
}
function loadState(conversationId, env) {
  try {
    const file = getStatePath(conversationId, env);
    if (!fs2.existsSync(file)) return null;
    const data = JSON.parse(fs2.readFileSync(file, "utf-8"));
    if (!data || typeof data !== "object" || !data.status) return null;
    return data;
  } catch {
    return null;
  }
}
function loadWorkflow(conversationId, env) {
  try {
    const file = getWorkflowPath(conversationId, env);
    if (!fs2.existsSync(file)) return null;
    const data = JSON.parse(fs2.readFileSync(file, "utf-8"));
    if (!data || typeof data !== "object" || !data.name || !Array.isArray(data.flatSteps)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
function loadActiveWorkflow(conversationId, env) {
  const state = loadState(conversationId, env);
  if (!state) return null;
  const workflow = loadWorkflow(conversationId, env);
  if (!workflow) return null;
  return { state, workflow };
}
function saveWorkflow(conversationId, workflow, env) {
  try {
    const file = getWorkflowPath(conversationId, env);
    fs2.mkdirSync(path.dirname(file), { recursive: true });
    fs2.writeFileSync(file, JSON.stringify(workflow, null, 2), "utf-8");
  } catch {
  }
}
function saveState(conversationId, state, env) {
  try {
    const file = getStatePath(conversationId, env);
    fs2.mkdirSync(path.dirname(file), { recursive: true });
    fs2.writeFileSync(file, JSON.stringify(state, null, 2), "utf-8");
  } catch {
  }
}

// src/lib/logDebug.ts
function logDebug(message, data) {
  if (process.env.VITEST && !process.env.WF_DEBUG) {
    return;
  }
  const line = `[${(logDebug.conversationId ?? "unknown").split("-")[0]}] ${message} ${data !== void 0 ? JSON.stringify(data, null, 2) : ""}
`;
  try {
    const filePath = getDebugLogPath(logDebug.conversationId);
    fs3.mkdirSync(path2.dirname(filePath), { recursive: true });
    fs3.appendFileSync(filePath, line);
  } catch {
  }
}
logDebug.conversationId = void 0;

// src/workflow.ts
function isConditionalStep(step2) {
  return step2.type === "condition";
}
function isGateStep(step2) {
  return step2.type === "gate";
}
function compileWorkflow(ast, filePath) {
  return {
    ...ast,
    filePath,
    flatSteps: flattenWorkflow(ast.steps)
  };
}
function flattenWorkflow(workflowSteps) {
  const flat = [];
  const fixups = [];
  function compile(steps, level, exitTarget) {
    const stepStartIndices = new Array(steps.length);
    for (let i = 0; i < steps.length; i++) {
      const step2 = steps[i];
      const isLast = i === steps.length - 1;
      const myIndex = flat.length;
      stepStartIndices[i] = myIndex;
      const afterThisStep = isLast ? exitTarget : () => stepStartIndices[i + 1];
      if (isConditionalStep(step2)) {
        const title = step2.title || step2.condition || "Condition";
        const condStep = {
          index: myIndex,
          level,
          title,
          type: "condition",
          condition: step2.condition,
          ...step2.instruction ? { instruction: step2.instruction } : {},
          nextIndex: 0,
          skipIndex: 0
        };
        flat.push(condStep);
        const yesSteps = step2.yes.steps;
        const noSteps = step2.no?.steps ?? [];
        let yesStartIndex = -1;
        let noStartIndex = -1;
        if (yesSteps.length > 0) {
          yesStartIndex = flat.length;
          compile(yesSteps, level + 1, afterThisStep);
        }
        if (noSteps.length > 0) {
          noStartIndex = flat.length;
          compile(noSteps, level + 1, afterThisStep);
        }
        fixups.push(() => {
          const afterCond = afterThisStep();
          condStep.nextIndex = yesSteps.length > 0 ? yesStartIndex : afterCond;
          condStep.skipIndex = noSteps.length > 0 ? noStartIndex : afterCond;
        });
      } else if (isGateStep(step2)) {
        const title = step2.title || step2.instruction || "Gate";
        const flatStep = {
          index: myIndex,
          level,
          title,
          type: "gate",
          instruction: step2.instruction,
          nextIndex: 0
        };
        flat.push(flatStep);
        fixups.push(() => {
          flatStep.nextIndex = afterThisStep();
        });
      } else {
        const title = step2.title || step2.instruction || "Step";
        const flatStep = {
          index: myIndex,
          level,
          title,
          type: "step",
          instruction: step2.instruction,
          nextIndex: 0
        };
        flat.push(flatStep);
        fixups.push(() => {
          flatStep.nextIndex = afterThisStep();
        });
      }
    }
  }
  compile(workflowSteps, 0, () => flat.length);
  for (const fixup of fixups) {
    fixup();
  }
  return flat;
}

// src/lib/visualize.ts
function escapeLabel(text) {
  return text.replace(/"/g, "#quot;").replace(/\r?\n/g, "<br/>");
}
function getFlatSteps(workflow) {
  return "flatSteps" in workflow ? workflow.flatSteps : flattenWorkflow(workflow.steps);
}
function visualize(workflow, activeStepIndex) {
  const flatSteps = getFlatSteps(workflow);
  if (flatSteps.length === 0) return "flowchart TD";
  const lines = ["flowchart TD"];
  for (const step2 of flatSteps) {
    const id = `s${step2.index}`;
    const isActive = activeStepIndex !== void 0 && step2.index === activeStepIndex;
    const prefix = isActive ? "\u25B6 " : "";
    if (step2.type === "condition") {
      const rawLabel = `${prefix}${step2.title}`;
      const label = escapeLabel(rawLabel);
      lines.push(`    ${id}{{"<i>${label}</i>"}}`);
    } else if (step2.type === "gate") {
      const rawLabel = `${prefix}${step2.title}`;
      const label = escapeLabel(rawLabel);
      lines.push(`    ${id}[["\u{1F6D1} ${label}"]]`);
    } else {
      const rawLabel = `${prefix}${step2.title}`;
      const label = escapeLabel(rawLabel);
      lines.push(`    ${id}["${label}"]`);
    }
  }
  for (const step2 of flatSteps) {
    const id = `s${step2.index}`;
    if (step2.type === "condition") {
      if (step2.nextIndex < flatSteps.length) {
        lines.push(`    ${id} -->|Yes| s${step2.nextIndex}`);
      }
      if (step2.skipIndex !== void 0 && step2.skipIndex < flatSteps.length) {
        lines.push(`    ${id} -->|No| s${step2.skipIndex}`);
      }
    } else {
      if (step2.nextIndex < flatSteps.length) {
        lines.push(`    ${id} --> s${step2.nextIndex}`);
      }
    }
  }
  if (activeStepIndex !== void 0 && activeStepIndex >= 0 && activeStepIndex < flatSteps.length) {
    lines.push(`    style s${activeStepIndex} stroke:#3b82f6,stroke-width:4px`);
  }
  return lines.join("\n");
}
function visualizePlainText(workflow, activeStepIndex) {
  if (workflow.steps.length === 0) return "";
  const lines = [];
  let stepIndex = 0;
  function walk(stepList, indent) {
    for (const step2 of stepList) {
      const myIndex = stepIndex++;
      const isActive = activeStepIndex !== void 0 && myIndex === activeStepIndex;
      const marker = isActive ? "\u25B6 [CURRENT] " : "";
      if (isConditionalStep(step2)) {
        const label = step2.title || step2.condition || "Condition";
        lines.push(`${indent}${marker}- If: ${label}`);
        if (step2.yes && step2.yes.steps.length > 0) {
          walk(step2.yes.steps, `${indent}  `);
        }
        if (step2.no && step2.no.steps.length > 0) {
          lines.push(`${indent}- Else:`);
          walk(step2.no.steps, `${indent}  `);
        }
      } else if (isGateStep(step2)) {
        const label = step2.title || step2.instruction || "Gate";
        lines.push(`${indent}${marker}- Gate: ${label} [Approval Required]`);
      } else {
        const label = step2.title || step2.instruction || "Step";
        lines.push(`${indent}${marker}- Step: ${label}`);
      }
    }
  }
  walk(workflow.steps, "");
  return lines.join("\n");
}
function visualizeWorkflowPrompt(name, workflow, filePath, activeStepIndex, statusHeader) {
  const mermaid = visualize(workflow, activeStepIndex);
  const plainText = visualizePlainText(workflow, activeStepIndex);
  const fileRef = filePath ? ` ("${filePath}")` : "";
  const lines = [];
  if (statusHeader) {
    lines.push(statusHeader, "");
  }
  lines.push(
    `[WORKFLOW VISUALIZATION: ${name}]`,
    `Present the structure of workflow "${name}" to the user.`,
    "",
    "If your environment supports rendering Mermaid diagrams, visualize it using:",
    "```mermaid",
    mermaid,
    "```",
    "",
    "If Mermaid rendering is not supported in the current interface, show the plain text representation instead:",
    "",
    plainText,
    "",
    "RULES:",
    `1. Do NOT read or inspect the workflow file${fileRef} or SKILL.md \u2014 steps are already loaded by the runner.`,
    "2. Do NOT execute any workflow steps. This is strictly an informational visualization."
  );
  return lines.join("\n");
}

// src/resolver.ts
var fs4 = __toESM(require("node:fs"), 1);
var path4 = __toESM(require("node:path"), 1);

// src/lib/markdown/wf.ts
var path3 = __toESM(require("node:path"), 1);

// src/lib/markdown/parsing.ts
function parse(markdown) {
  return MarkdownParser.parse(markdown);
}
var MismatchError = class _MismatchError extends Error {
  constructor() {
    super("Mismatched token");
    Object.setPrototypeOf(this, _MismatchError.prototype);
  }
};
var MarkdownParser = class _MarkdownParser {
  chars;
  index = 0;
  static NEWLINE = ["\r\n", "\r", "\n"];
  static NEW_PARAGRAPH = _MarkdownParser.NEWLINE.flatMap(
    (prefix) => _MarkdownParser.NEWLINE.map((suffix) => prefix + suffix)
  );
  constructor(input) {
    this.chars = [...input];
  }
  static parse(input) {
    return new _MarkdownParser(input).parseNext();
  }
  parseNext(end = "") {
    const root = {
      type: "fragment",
      children: [],
      source: ""
    };
    const startIndex = this.index;
    let text = "";
    let lastBlockIndex = 0;
    let paragraphStartIndex = this.index;
    let textStartIndex = this.index;
    const flushParagraph = (endIndex) => {
      if (text !== "") {
        root.children.push({
          type: "text",
          content: text,
          source: this.getSlice(textStartIndex, endIndex)
        });
        text = "";
      }
      const inlineChildren = root.children.splice(lastBlockIndex);
      if (inlineChildren.length > 0) {
        const paragraph = {
          type: "paragraph",
          children: inlineChildren,
          source: this.getSlice(paragraphStartIndex, endIndex)
        };
        root.children.push(paragraph);
      }
      lastBlockIndex = root.children.length;
    };
    while (!this.done) {
      const escapedText = this.parseText("");
      if (escapedText !== "") {
        text += escapedText;
        continue;
      }
      if (end !== "" && (this.matches(end) || this.matches(..._MarkdownParser.NEWLINE))) {
        break;
      }
      const headingMatch = end === "" && this.atLineStart() ? this.matchHeadingPrefix() : null;
      if (headingMatch !== null) {
        flushParagraph(this.index);
        const headingStartIndex = this.index;
        this.advance(headingMatch.prefixLength);
        const inlines = this.parseNext("\n");
        const children = inlines.type === "fragment" ? inlines.children : [inlines];
        const headingEndIndex = this.index;
        this.stripTrailingHeadingHashes(children);
        while (_MarkdownParser.NEWLINE.includes(this.current)) {
          this.advance();
        }
        root.children.push({
          type: "heading",
          depth: headingMatch.depth,
          children,
          source: this.getSlice(headingStartIndex, headingEndIndex)
        });
        lastBlockIndex = root.children.length;
        paragraphStartIndex = this.index;
        textStartIndex = this.index;
        continue;
      }
      if (this.matches(..._MarkdownParser.NEW_PARAGRAPH)) {
        const paragraphEndIndex = this.index;
        while (_MarkdownParser.NEWLINE.includes(this.current)) {
          this.advance();
        }
        flushParagraph(paragraphEndIndex);
        paragraphStartIndex = this.index;
        textStartIndex = this.index;
        continue;
      }
      const nodeStartIndex = this.index;
      let node = null;
      try {
        node = this.parseCurrent();
      } catch (error) {
        if (!(error instanceof MismatchError)) {
          throw error;
        }
      }
      if (node === null) {
        this.seek(nodeStartIndex);
        text += this.current;
        this.advance();
        continue;
      }
      if (text !== "") {
        root.children.push({
          type: "text",
          content: text,
          source: this.getSlice(textStartIndex, nodeStartIndex)
        });
      }
      text = "";
      textStartIndex = this.index;
      root.children.push(node);
    }
    if (lastBlockIndex > 0) {
      flushParagraph(this.index);
    } else {
      if (text !== "") {
        root.children.push({
          type: "text",
          content: text,
          source: this.getSlice(textStartIndex, this.index)
        });
      }
    }
    if (root.children.length === 1) {
      return root.children[0];
    }
    root.source = this.getSlice(startIndex, this.index);
    return root;
  }
  stripTrailingHeadingHashes(children) {
    const last = children[children.length - 1];
    if (last?.type === "text") {
      last.content = last.content.replace(/\s+#+\s*$/, "");
      if (!last.content.trim()) {
        children.pop();
      }
    }
  }
  parseCurrent() {
    const char = this.lookAhead();
    const startIndex = this.index;
    switch (char) {
      case "*":
      case "_": {
        const delimiter = this.matches("**") ? "**" : char;
        this.advance(delimiter.length);
        const children = this.parseNext(delimiter);
        this.match(delimiter);
        return {
          type: delimiter.length === 1 ? "italic" : "bold",
          children,
          source: this.getSlice(startIndex, this.index)
        };
      }
      case "~": {
        this.match("~~");
        const children = this.parseNext("~~");
        this.match("~~");
        return {
          type: "strike",
          children,
          source: this.getSlice(startIndex, this.index)
        };
      }
      case "`": {
        if (this.matches("```")) {
          return null;
        }
        const delimiter = this.matches("``") ? "``" : "`";
        this.match(delimiter);
        const content = this.parseText(delimiter).trim();
        if (this.matches("```")) {
          return null;
        }
        this.match(delimiter);
        return {
          type: "code",
          content,
          source: this.getSlice(startIndex, this.index)
        };
      }
      case "!": {
        this.advance();
        this.match("[");
        const alt = this.parseText("]");
        this.match("](");
        const src = this.parseText(")");
        this.match(")");
        return {
          type: "image",
          src,
          alt,
          source: this.getSlice(startIndex, this.index)
        };
      }
      case "[": {
        this.advance();
        const label = this.parseNext("]");
        this.match("](");
        const href = this.parseText(")", '"');
        let title;
        if (this.matches('"')) {
          this.match('"');
          title = this.parseText('"');
          this.match('"');
        }
        this.match(")");
        return {
          type: "link",
          href: href.trim(),
          ...title !== void 0 ? { title } : {},
          children: label,
          source: this.getSlice(startIndex, this.index)
        };
      }
      default:
        return null;
    }
  }
  parseText(...end) {
    let text = "";
    while (!this.done) {
      if (this.current === "\\" && this.index + 1 < this.length) {
        this.advance();
        text += this.current;
        this.advance();
        continue;
      }
      if (end.some((token) => token === "" || this.matches(token)) || this.matches(..._MarkdownParser.NEWLINE)) {
        break;
      }
      text += this.current;
      this.advance();
    }
    return text;
  }
  atLineStart() {
    if (this.index === 0) return true;
    const prev = this.chars[this.index - 1];
    return prev === "\n" || prev === "\r";
  }
  matchHeadingPrefix() {
    if (!this.atLineStart()) return null;
    const slice = this.getSlice(this.index, this.index + 64);
    const match = slice.match(/^[ ]{0,3}(#{1,6})(?:[ \t]+|(?=[\r\n]|$))/);
    if (!match) return null;
    return { depth: match[1].length, prefixLength: match[0].length };
  }
  get done() {
    return this.index >= this.length;
  }
  get length() {
    return this.chars.length;
  }
  get current() {
    return this.chars[this.index];
  }
  advance(length = 1) {
    this.index += length;
  }
  seek(index) {
    this.index = index;
  }
  matches(...lookahead) {
    return lookahead.some(
      (substring) => this.lookAhead(substring.length) === substring
    );
  }
  match(...lookahead) {
    for (const substring of lookahead) {
      if (this.lookAhead(substring.length) === substring) {
        this.advance(substring.length);
        return;
      }
    }
    throw new MismatchError();
  }
  lookAhead(length = 1) {
    if (length === 1) {
      return this.current;
    }
    return this.getSlice(this.index, this.index + length);
  }
  getSlice(start, end) {
    return this.chars.slice(start, end).join("");
  }
};

// src/lib/markdown/wf.ts
function getInnerText(node) {
  if (!node) return "";
  if ("content" in node) return node.content;
  if ("children" in node) {
    return Array.isArray(node.children) ? node.children.map(getInnerText).join("") : getInnerText(node.children);
  }
  return "";
}
var KEYWORDS = ["if", "else", "no", "gate"];
var KEYWORD_REGEX = new RegExp(
  `^(${KEYWORDS.join("|")})\\s*:(?:\\s*(.*))?$`,
  "i"
);
function stripLeading(str) {
  return str.replace(/^[^\p{L}]+/u, "");
}
function removeFirstWord(str) {
  return str.replace(/^\S+/, "");
}
function parseHeading(heading, depth = 2) {
  const effectiveDepth = typeof heading === "string" ? depth : "depth" in heading ? heading.depth : depth;
  const text = (typeof heading === "string" ? heading : getInnerText(heading)).trim();
  let candidate = stripLeading(text);
  let match = candidate.match(KEYWORD_REGEX);
  if (!match) {
    candidate = stripLeading(removeFirstWord(candidate));
    match = candidate.match(KEYWORD_REGEX);
  }
  if (!match) return { type: "step", title: text, depth: effectiveDepth };
  const keyword = match[1].toLowerCase();
  const condition = (match[2] ?? "").trim();
  if (keyword === "else" || keyword === "no") {
    return { type: "else", title: condition || keyword, depth: effectiveDepth };
  }
  if (keyword === "gate") {
    return {
      type: "gate",
      title: condition || keyword,
      depth: effectiveDepth
    };
  }
  return {
    type: "if",
    condition,
    title: condition || keyword,
    depth: effectiveDepth
  };
}
function sliceNodesMarkdown(nodes) {
  if (!nodes?.length) return "";
  return nodes.map((n) => n.source).join("\n\n").trim();
}
function parseBranchSteps(nodes, targetDepth, defaultTitle, fallback) {
  if (!nodes.length) return [];
  const candidateHeadings = nodes.filter(
    (n) => n.type === "heading" && typeof n.depth === "number" && n.depth >= targetDepth
  );
  if (candidateHeadings.length === 0) {
    const text = sliceNodesMarkdown(nodes);
    return [
      {
        type: "step",
        title: defaultTitle,
        instruction: text || fallback
      }
    ];
  }
  const result = parseSteps(nodes, targetDepth);
  const steps = [...result.steps];
  if (result.preamble) {
    steps.unshift({
      type: "step",
      title: defaultTitle,
      instruction: result.preamble
    });
  }
  return steps;
}
function parseSteps(nodes, targetDepth) {
  if (!nodes?.length) return { steps: [] };
  const candidateHeadings = nodes.map((node, idx) => ({ node, idx })).filter(
    (item) => item.node.type === "heading" && typeof item.node.depth === "number" && item.node.depth >= targetDepth
  );
  if (candidateHeadings.length === 0) {
    return { preamble: sliceNodesMarkdown(nodes), steps: [] };
  }
  const effectiveDepth = Math.min(
    ...candidateHeadings.map((h) => h.node.depth)
  );
  const headingsAtDepth = candidateHeadings.filter(
    (h) => h.node.depth === effectiveDepth
  );
  const preambleNodes = nodes.slice(0, headingsAtDepth[0].idx);
  const preamble = preambleNodes.length > 0 ? sliceNodesMarkdown(preambleNodes) : void 0;
  const sections = headingsAtDepth.map((cur, i2) => ({
    headingNode: cur.node,
    bodyNodes: nodes.slice(
      cur.idx + 1,
      headingsAtDepth[i2 + 1]?.idx ?? nodes.length
    )
  }));
  const steps = [];
  let i = 0;
  while (i < sections.length) {
    const sec = sections[i];
    const parsed = parseHeading(sec.headingNode);
    if (parsed.type === "if") {
      const condition = parsed.condition || parsed.title;
      const childHeadings = sec.bodyNodes.map((node, idx) => ({ node, idx })).filter(
        (item) => item.node.type === "heading" && typeof item.node.depth === "number" && item.node.depth > effectiveDepth
      );
      let conditionInstruction;
      let yesSteps = [];
      let noSteps;
      if (childHeadings.length > 0) {
        const childDepth = Math.min(...childHeadings.map((h) => h.node.depth));
        const directChildren = childHeadings.filter(
          (h) => h.node.depth === childDepth
        );
        const preNodes = sec.bodyNodes.slice(0, directChildren[0].idx);
        conditionInstruction = sliceNodesMarkdown(preNodes) || void 0;
        let balance = 0;
        let elseChildIdx = -1;
        for (let j = 0; j < directChildren.length; j++) {
          const p = parseHeading(directChildren[j].node);
          if (p.type === "if") {
            balance++;
          } else if (p.type === "else") {
            if (balance === 0) {
              elseChildIdx = j;
              break;
            }
            balance--;
          }
        }
        if (elseChildIdx !== -1) {
          const yesNodes = sec.bodyNodes.slice(
            directChildren[0].idx,
            directChildren[elseChildIdx].idx
          );
          const noNodes = sec.bodyNodes.slice(directChildren[elseChildIdx].idx);
          yesSteps = parseBranchSteps(
            yesNodes,
            childDepth,
            `${condition} yes`,
            "Execute condition true branch"
          );
          noSteps = parseBranchSteps(
            noNodes,
            childDepth,
            `${condition} no`,
            "Execute condition false branch"
          );
        } else {
          const yesNodes = sec.bodyNodes.slice(directChildren[0].idx);
          yesSteps = parseBranchSteps(
            yesNodes,
            childDepth,
            `${condition} yes`,
            "Execute condition true branch"
          );
          if (i + 1 < sections.length && parseHeading(sections[i + 1].headingNode).type === "else") {
            i++;
            noSteps = parseBranchSteps(
              sections[i].bodyNodes,
              effectiveDepth + 1,
              parseHeading(sections[i].headingNode).title || `${condition} no`,
              "Execute condition false branch"
            );
          }
        }
      } else {
        if (i + 1 < sections.length && parseHeading(sections[i + 1].headingNode).type === "else") {
          const text = sliceNodesMarkdown(sec.bodyNodes);
          yesSteps = [
            {
              type: "step",
              title: `${condition} yes`,
              instruction: text || "Execute condition true branch"
            }
          ];
          i++;
          const elseHeading = parseHeading(sections[i].headingNode);
          noSteps = parseBranchSteps(
            sections[i].bodyNodes,
            effectiveDepth + 1,
            elseHeading.title && elseHeading.title !== "else" && elseHeading.title !== "no" ? elseHeading.title : `${condition} no`,
            "Execute condition false branch"
          );
        } else {
          const text = sliceNodesMarkdown(sec.bodyNodes);
          conditionInstruction = text || void 0;
        }
      }
      steps.push({
        type: "condition",
        title: parsed.title,
        condition,
        ...conditionInstruction ? { instruction: conditionInstruction } : {},
        yes: { steps: yesSteps },
        ...noSteps ? { no: { steps: noSteps } } : {}
      });
    } else if (parsed.type === "else") {
      const instruction = sliceNodesMarkdown(sec.bodyNodes);
      steps.push({
        type: "step",
        title: parsed.title && parsed.title !== "else" && parsed.title !== "no" ? parsed.title : "No",
        instruction: instruction || parsed.title
      });
    } else if (parsed.type === "gate") {
      const instruction = sliceNodesMarkdown(sec.bodyNodes);
      steps.push({
        type: "gate",
        title: parsed.title,
        instruction: instruction || parsed.title
      });
    } else {
      const instruction = sliceNodesMarkdown(sec.bodyNodes);
      steps.push({
        type: "step",
        title: parsed.title,
        instruction: instruction || parsed.title
      });
    }
    i++;
  }
  return { preamble, steps };
}
function parseFrontmatter(markdown) {
  const trimmed = markdown.replace(/^\s*\n/, "");
  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { content: markdown };
  const frontmatter = {};
  for (const line of match[1].split("\n")) {
    const [k, ...v] = line.split(":");
    if (k && v.length) {
      frontmatter[k.trim()] = v.join(":").trim().replace(/^["']|["']$/g, "");
    }
  }
  return { frontmatter, content: trimmed.slice(match[0].length) };
}
function parseWorkflowMarkdown(content, filePath) {
  const { frontmatter, content: mdContent } = parseFrontmatter(content);
  const ast = parse(mdContent);
  const nodes = ast.type === "fragment" ? ast.children : [ast];
  let name = frontmatter?.name;
  let remainingNodes = nodes;
  const h1Idx = nodes.findIndex((n) => n.type === "heading" && n.depth === 1);
  if (h1Idx !== -1) {
    name ??= getInnerText(nodes[h1Idx]).trim();
    remainingNodes = nodes.slice(h1Idx + 1);
  }
  if (!name && filePath) {
    name = path3.basename(filePath, path3.extname(filePath));
  }
  const parsed = parseSteps(remainingNodes, 2);
  return {
    name: name || "Workflow",
    ...frontmatter?.description ? { description: frontmatter.description } : {},
    ...parsed.preamble ? { preamble: parsed.preamble } : {},
    steps: parsed.steps
  };
}

// src/resolver.ts
function resolveWorkflowPath(userPath, workspacePaths) {
  let cleanPath = userPath.trim();
  const bracketMatch = cleanPath.match(/^@\[([^\]]+)\]$/);
  if (bracketMatch) {
    cleanPath = bracketMatch[1].trim();
  } else {
    if (cleanPath.startsWith("@")) {
      cleanPath = cleanPath.slice(1).trim();
    }
    const quoteMatch = cleanPath.match(/^["']([^"']+)["']$/);
    if (quoteMatch) {
      cleanPath = quoteMatch[1].trim();
    }
  }
  function checkCandidate(candidatePath) {
    try {
      if (fs4.existsSync(candidatePath) && fs4.statSync(candidatePath).isFile()) {
        return candidatePath;
      }
      if (!path4.extname(candidatePath)) {
        for (const ext of [".md", ".markdown", ".json"]) {
          const candidate = candidatePath + ext;
          if (fs4.existsSync(candidate) && fs4.statSync(candidate).isFile()) {
            return candidate;
          }
        }
      }
    } catch {
    }
    return null;
  }
  if (path4.isAbsolute(cleanPath)) {
    const found = checkCandidate(cleanPath);
    if (found) return found;
  }
  if (workspacePaths && workspacePaths.length > 0) {
    for (const ws of workspacePaths) {
      const resolved = checkCandidate(path4.resolve(ws, cleanPath));
      if (resolved) return resolved;
    }
  }
  const cwdResolved = checkCandidate(path4.resolve(process.cwd(), cleanPath));
  if (cwdResolved) return cwdResolved;
  return null;
}
function defaultWorkflowResolver(targetPath, workspacePaths) {
  const resolved = resolveWorkflowPath(targetPath, workspacePaths);
  if (!resolved) return null;
  try {
    const content = fs4.readFileSync(resolved, "utf-8");
    if (/\.(md|markdown)$/i.test(resolved)) {
      try {
        const parsed2 = parseWorkflowMarkdown(content, resolved);
        if (!Array.isArray(parsed2.steps) || parsed2.steps.length === 0) {
          return {
            error: `Workflow file "${targetPath}" does not contain any steps.`
          };
        }
        return { filePath: resolved, workflow: parsed2 };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          error: `Failed to parse workflow Markdown: ${message}`
        };
      }
    }
    const parsed = JSON.parse(content);
    parsed.name = parsed.name || path4.basename(resolved, path4.extname(resolved));
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      return {
        error: `Workflow file "${targetPath}" does not contain any steps.`
      };
    }
    return { filePath: resolved, workflow: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Failed to parse workflow JSON: ${message}` };
  }
}

// src/actions/formatters.ts
var OVERRIDE_HEADER = "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]";
function injectSystemMessage(ephemeralMessage) {
  const message = ephemeralMessage.startsWith(OVERRIDE_HEADER) ? ephemeralMessage : `${OVERRIDE_HEADER}

${ephemeralMessage}`;
  return {
    injectSteps: [{ ephemeralMessage: message }]
  };
}
function parseDecision(modelText) {
  const match = modelText.match(/\[DECISION:\s*(YES|NO)\]/i) || modelText.match(/\[(YES|NO)\]/i);
  return match && (match[1] || match[2]).toUpperCase() === "YES" ? "YES" : "NO";
}
function formatStepPrompt(active, currentStep, stepNum, totalSteps) {
  const wfName = active.workflow.name;
  const title = currentStep.title || `Step ${stepNum}`;
  const stepTitle = `: ${currentStep.title}`;
  const levelStr = currentStep.level > 0 ? ` (Nesting Level ${currentStep.level})` : "";
  const fileRef = active.workflow.filePath ? ` ("${active.workflow.filePath}")` : "";
  if (currentStep.type === "condition") {
    const conditionText = currentStep.condition || title;
    const lines = [
      `[WORKFLOW ${active.state.status.toUpperCase()}: ${wfName}]`,
      `Step ${stepNum} of ${totalSteps}${stepTitle}${levelStr} (Condition Evaluation)`,
      `Condition: "${currentStep.condition}"`
    ];
    if (active.workflow.preamble) {
      lines.push("", "CONTEXT:", active.workflow.preamble);
    }
    lines.push("", "INSTRUCTION:");
    if (currentStep.instruction) {
      lines.push(currentStep.instruction);
    } else {
      lines.push(
        `Evaluate whether the following condition is true or false: "${currentStep.condition}".`,
        "If needed, use tools to inspect the environment, files, date/time, or git state."
      );
    }
    lines.push(
      "",
      `Start your response with: "Checking condition: ${conditionText}"`,
      "At the very end of your response, output strictly either:",
      "[DECISION: YES] or [DECISION: NO]",
      "",
      "RULES:",
      `1. Do NOT read or inspect the workflow file${fileRef} or SKILL.md \u2014 steps are already loaded by the runner.`
    );
    return lines.join("\n");
  }
  const isGate = currentStep.type === "gate";
  const promptParts = [
    `[WORKFLOW ${active.state.status.toUpperCase()}: ${wfName}]`,
    `Step ${stepNum} of ${totalSteps}${stepTitle}${levelStr}`
  ];
  if (active.workflow.preamble) {
    promptParts.push("", "CONTEXT:", active.workflow.preamble);
  }
  promptParts.push("", "INSTRUCTION:", currentStep.instruction || "");
  if (isGate) {
    promptParts.push(
      "",
      "NOTE: This step is a human approval gate. After completing this step's instructions, remind the user they can proceed with '/wf-next' or stop with '/wf-stop'."
    );
  }
  promptParts.push(
    "",
    "RULES:",
    isGate ? `1. Start your response with: "Waiting at Gate: ${title}"` : `1. Start your response with: "Executing Step: ${title}"`,
    "2. Execute this specific step now.",
    "3. Do NOT jump ahead to subsequent steps.",
    "4. Conclude your response when this step is complete.",
    `5. Do NOT read or inspect the workflow file${fileRef} or SKILL.md \u2014 steps are already loaded by the runner.`
  );
  return promptParts.join("\n");
}
function formatAdvanceReason(step2, preamble) {
  const isCondition = step2.type === "condition";
  const isGate = step2.type === "gate";
  const title = step2.title || `Step ${step2.index + 1}`;
  const levelStr = step2.level > 0 ? ` (Level ${step2.level})` : "";
  const reasonParts = [
    `[wf] Executing next step: ${title}${levelStr}`
  ];
  if (preamble) {
    reasonParts.push("", "CONTEXT:", preamble);
  }
  if (isCondition) {
    const conditionText = step2.condition || title;
    reasonParts.push(
      "",
      step2.instruction || `Evaluate condition: "${step2.condition}"`,
      "",
      `Start your response with: "Checking condition: ${conditionText}"`,
      "At the very end of your response, output strictly either:",
      "[DECISION: YES] or [DECISION: NO]"
    );
  } else {
    reasonParts.push("", "INSTRUCTION:", step2.instruction ?? "");
  }
  if (isGate) {
    reasonParts.push(
      "",
      `Start your response with: "Waiting at Gate: ${title}"`,
      "NOTE: This step is a human approval gate. After completing this step's instructions, remind the user they can proceed with '/wf-next' or stop with '/wf-stop'."
    );
  } else if (!isCondition) {
    reasonParts.push(
      "",
      `Start your response with: "Executing Step: ${title}"`,
      "Continue immediately and execute this step."
    );
  }
  return reasonParts.join("\n");
}

// src/lib/assert.ts
function assert(condition, message) {
  if (!condition) {
    throw new Error(message ?? "Assertion failed");
  }
}

// src/transitions.ts
function advanceTo(flatSteps, state, iterationCount, decision) {
  const current = flatSteps[state.step];
  const targetIndex = current?.type === "condition" ? decision === "YES" ? current.nextIndex : current.skipIndex ?? current.nextIndex : current?.nextIndex;
  const isFinished = targetIndex === void 0 || targetIndex >= flatSteps.length;
  return {
    ...state,
    step: isFinished ? flatSteps.length : targetIndex,
    status: isFinished ? "finished" : "active",
    iterationCount
  };
}
function startWorkflow(workflow) {
  if (workflow.flatSteps.length === 0) {
    throw new Error(
      `Cannot start workflow "${workflow.name}": contains no executable steps.`
    );
  }
  return {
    state: {
      status: "active",
      step: 0,
      iterationCount: 0
    },
    workflow
  };
}
function pauseWorkflow(state) {
  if (state?.status === "active") {
    return {
      ...state,
      status: "paused"
    };
  }
  return state;
}
function resumeWorkflow(flatSteps, state) {
  assert(
    state && (state.status === "active" || state.status === "paused"),
    "Cannot resume workflow: no active or paused workflow is loaded"
  );
  const currentStep = flatSteps[state.step];
  if (state.status === "paused" && currentStep?.type === "gate") {
    return advanceTo(flatSteps, state, state.iterationCount);
  }
  return {
    ...state,
    status: "active"
  };
}
function advanceStep(flatSteps, state, decision) {
  if (state?.status !== "active") {
    return state;
  }
  const nextIterationCount = state.iterationCount + 1;
  const maxIterations = flatSteps.length * 5;
  if (nextIterationCount > maxIterations) {
    return {
      status: "error",
      step: state.step,
      error: `Workflow terminated: Exceeded safety iteration limit (${maxIterations}).`,
      iterationCount: nextIterationCount
    };
  }
  const currentStep = flatSteps[state.step];
  if (currentStep?.type === "gate") {
    return {
      step: state.step,
      status: "paused",
      iterationCount: nextIterationCount
    };
  }
  return advanceTo(flatSteps, state, nextIterationCount, decision);
}
function failWorkflow(state, error) {
  if (!state || state.status !== "active" && state.status !== "paused") {
    return state;
  }
  return {
    status: "error",
    step: state.step,
    iterationCount: state.iterationCount,
    error
  };
}
function stopWorkflowState(state, workflowName) {
  if (!state || state.status !== "active" && state.status !== "paused") {
    return { state: null, wasRunning: false };
  }
  return {
    state: {
      status: "finished",
      step: state.step,
      iterationCount: state.iterationCount
    },
    wasRunning: true,
    workflowName
  };
}

// src/actions/step.ts
function step(_info, active) {
  assert(
    active && (active.state.status === "active" || active.state.status === "paused"),
    "Cannot execute step: workflow must be active or paused"
  );
  const currentStep = active.workflow.flatSteps[active.state.step];
  assert(currentStep, "Current step does not exist");
  const stepNum = active.state.step + 1;
  const totalSteps = active.workflow.flatSteps.length;
  const prompt = formatStepPrompt(active, currentStep, stepNum, totalSteps);
  logDebug("Injecting step", {
    stepNum,
    totalSteps,
    level: currentStep.level,
    status: active.state.status
  });
  return {
    active,
    response: injectSystemMessage(prompt)
  };
}

// src/actions/next.ts
function nextPre(info, active) {
  assert(
    active && (active.state.status === "active" || active.state.status === "paused"),
    "No workflow is running"
  );
  const nextState = resumeWorkflow(active.workflow.flatSteps, active.state);
  const nextActive = { ...active, state: nextState };
  if (nextState.status === "finished") {
    return {
      active: nextActive,
      response: injectSystemMessage(
        `[WORKFLOW STATUS: FINISHED]
Workflow "${active.workflow.name}" completed successfully.`
      )
    };
  }
  return step(info, nextActive);
}
function nextStop(_info, active) {
  assert(
    active?.state.status === "active",
    "nextStop requires an active workflow"
  );
  const nextState = advanceStep(active.workflow.flatSteps, active.state);
  const nextActive = nextState ? { ...active, state: nextState } : null;
  if (nextState?.status === "finished") {
    logDebug("All workflow steps complete", {
      totalSteps: active.workflow.flatSteps.length
    });
    return {
      active: nextActive,
      response: { decision: "allow" }
    };
  }
  if (nextState?.status === "error") {
    logDebug("Workflow terminated on error", { error: nextState.error });
    return {
      active: nextActive,
      response: { decision: "allow" }
    };
  }
  if (nextState?.status === "active") {
    const nextTargetStep = active.workflow.flatSteps[nextState.step];
    const stepNum = nextState.step + 1;
    const totalSteps = active.workflow.flatSteps.length;
    const reason = formatAdvanceReason(
      nextTargetStep,
      active.workflow.preamble
    );
    logDebug("Advancing to step (auto)", {
      nextNum: stepNum,
      totalSteps,
      level: nextTargetStep.level
    });
    return {
      active: nextActive,
      response: {
        decision: "continue",
        reason
      }
    };
  }
  logDebug("Step finished at gate, yielding to user", {
    nextStep: (nextState?.step ?? 0) + 1
  });
  return {
    active: nextActive,
    response: { decision: "allow" }
  };
}

// src/lib/parseCommand.ts
function parseFilePath(argsStr) {
  const trimmed = argsStr.trim();
  if (!trimmed) {
    return {
      success: false,
      error: "Missing required argument: <workflow-file>"
    };
  }
  const bracketMatch = trimmed.match(/^@\[([^\]]+)\]/);
  if (bracketMatch) {
    return { success: true, args: { path: bracketMatch[1].trim() } };
  }
  const quoteMatch = trimmed.match(/^["']([^"']+)["']/);
  if (quoteMatch) {
    return { success: true, args: { path: quoteMatch[1].trim() } };
  }
  const atMatch = trimmed.match(/^@(\S+)/);
  if (atMatch) {
    return { success: true, args: { path: atMatch[1].trim() } };
  }
  const firstToken = trimmed.split(/\s+/)[0];
  return { success: true, args: { path: firstToken } };
}
function parseOptionalFilePath(argsStr) {
  const trimmed = argsStr.trim();
  if (!trimmed) {
    return { success: true, args: {} };
  }
  return parseFilePath(trimmed);
}
var COMMAND_DEFS = [
  {
    name: "run",
    slashCommand: "/wf",
    params: "<workflow-file>",
    description: "Start a workflow from a Markdown or JSON file",
    parse: parseFilePath
  },
  {
    name: "show",
    slashCommand: "/wf-show",
    params: "[<workflow-file>]",
    description: "Visualize workflow and show status / progress",
    parse: parseOptionalFilePath
  },
  {
    name: "next",
    slashCommand: "/wf-next",
    params: "",
    description: "Execute the next step in paused mode",
    parse: (argsStr) => {
      if (argsStr.trim().length > 0) {
        return {
          success: false,
          error: `'next' command does not accept arguments: "${argsStr.trim()}"`
        };
      }
      return { success: true, args: {} };
    }
  },
  {
    name: "stop",
    slashCommand: "/wf-stop",
    params: "",
    description: "Stop and reset the active workflow",
    parse: (argsStr) => {
      if (argsStr.trim().length > 0) {
        return {
          success: false,
          error: `'stop' command does not accept arguments: "${argsStr.trim()}"`
        };
      }
      return { success: true, args: {} };
    }
  },
  {
    name: "help",
    slashCommand: "/wf-help",
    params: "",
    description: "Show this help reference",
    parse: (argsStr) => {
      if (argsStr.trim().length > 0) {
        return {
          success: false,
          error: `'help' command does not accept arguments: "${argsStr.trim()}"`
        };
      }
      return { success: true, args: {} };
    }
  }
];
function getHelpText(error) {
  const lines = [];
  if (error) {
    lines.push(
      `[Workflow Error] CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER:  ${error}`,
      ""
    );
  } else {
    lines.push("Show this message directly to the user:", "");
  }
  lines.push("Workflow Runner Commands:");
  for (const cmd of COMMAND_DEFS) {
    const usage = `${cmd.slashCommand}${cmd.params ? ` ${cmd.params}` : ""}`;
    lines.push(`  ${usage.padEnd(26)} - ${cmd.description}`);
  }
  return lines.join("\n");
}
function findCommandByName(name) {
  return COMMAND_DEFS.find((c) => c.name === name);
}
function parseCommand(input) {
  let cleanInput = input.trim();
  const userRequestMatch = cleanInput.match(
    /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i
  );
  if (userRequestMatch) {
    cleanInput = userRequestMatch[1].trim();
  } else {
    cleanInput = cleanInput.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, "").trim();
  }
  const match = cleanInput.match(
    /^([/@$])(wf(?::wf)?)(?:[-:]([a-z0-9_-]+))?[:,-]?(?:[^\S\r\n]+([^\r\n]*)|$)/i
  );
  if (!match) {
    return { isWfCommand: false };
  }
  const subcommand = match[3]?.toLowerCase();
  const rawArgs = (match[4] ?? "").trim();
  if (subcommand) {
    const cmdName = subcommand;
    const def = findCommandByName(cmdName);
    if (!def) {
      return { isWfCommand: false };
    }
    const parsed2 = def.parse(rawArgs);
    if (!parsed2.success) {
      return {
        isWfCommand: true,
        error: parsed2.error,
        helpText: getHelpText(parsed2.error)
      };
    }
    return {
      isWfCommand: true,
      command: {
        name: def.name,
        args: parsed2.args
      },
      helpText: def.name === "help" ? getHelpText() : void 0
    };
  }
  if (!rawArgs) {
    return {
      isWfCommand: true,
      error: "Missing required argument: <workflow-file>",
      helpText: getHelpText("Missing required argument: <workflow-file>")
    };
  }
  const parsed = parseFilePath(rawArgs);
  if (!parsed.success) {
    return {
      isWfCommand: true,
      error: parsed.error,
      helpText: getHelpText(parsed.error)
    };
  }
  return {
    isWfCommand: true,
    command: {
      name: "run",
      args: parsed.args
    }
  };
}

// src/actions/run.ts
function run(info, active, command) {
  const targetPath = command.args.path ?? "";
  if (!targetPath) {
    return {
      active,
      response: injectSystemMessage(
        getHelpText("Missing workflow file path for /wf.")
      )
    };
  }
  const resolver = info.workflowResolver || defaultWorkflowResolver;
  const resolved = resolver(targetPath, info.payload.workspacePaths);
  if (!resolved) {
    return {
      active,
      response: injectSystemMessage(
        getHelpText(
          `Workflow file not found: "${targetPath}". Please check the path and try again.`
        )
      )
    };
  }
  if ("error" in resolved) {
    return {
      active,
      response: injectSystemMessage(getHelpText(resolved.error))
    };
  }
  const compiled = compileWorkflow(resolved.workflow, resolved.filePath);
  if (compiled.flatSteps.length === 0) {
    return {
      active,
      response: injectSystemMessage(
        getHelpText(
          `Workflow file "${targetPath}" contains no executable steps.`
        )
      )
    };
  }
  const nextActive = startWorkflow(compiled);
  return step(info, nextActive);
}

// src/actions/show.ts
function show(info, active, command) {
  const targetPath = command?.args.path?.trim() ?? "";
  if (!targetPath) {
    if (!active) {
      return {
        active,
        response: injectSystemMessage(
          "[WORKFLOW STATUS]\nNo workflow is currently loaded. Run /wf <workflow-file> to start a workflow, or /wf-show <workflow-file> to inspect one."
        )
      };
    }
    if (active.state.status === "finished") {
      return {
        active,
        response: injectSystemMessage(
          `[WORKFLOW STATUS: FINISHED]
Workflow "${active.workflow.name}" completed successfully.`
        )
      };
    }
    if (active.state.status === "error") {
      return {
        active,
        response: injectSystemMessage(
          `[WORKFLOW STATUS: ERROR]
Workflow: ${active.workflow.name}
Error: ${active.state.error}`
        )
      };
    }
    const currentLevel = active.workflow.flatSteps[active.state.step]?.level ?? 0;
    const statusHeader2 = `[WORKFLOW STATUS: ${active.state.status.toUpperCase()}]
Workflow: ${active.workflow.name}
Step: ${active.state.step + 1} of ${active.workflow.flatSteps.length} (Nesting Level ${currentLevel})`;
    const prompt2 = visualizeWorkflowPrompt(
      active.workflow.name,
      active.workflow,
      active.workflow.filePath,
      active.state.step,
      statusHeader2
    );
    return {
      active,
      response: injectSystemMessage(prompt2)
    };
  }
  const resolver = info.workflowResolver || defaultWorkflowResolver;
  const resolved = resolver(targetPath, info.payload.workspacePaths);
  if (!resolved) {
    return {
      active,
      response: injectSystemMessage(
        getHelpText(
          `Workflow file not found: "${targetPath}". Please check the path and try again.`
        )
      )
    };
  }
  if ("error" in resolved) {
    return {
      active,
      response: injectSystemMessage(getHelpText(resolved.error))
    };
  }
  const isActiveWorkflow = active && (active.state.status === "active" || active.state.status === "paused") && active.workflow.filePath === resolved.filePath;
  const activeStepIndex = isActiveWorkflow ? active.state.step : void 0;
  const statusHeader = isActiveWorkflow ? `[WORKFLOW STATUS: ${active.state.status.toUpperCase()}]
Workflow: ${active.workflow.name}
Step: ${active.state.step + 1} of ${active.workflow.flatSteps.length} (Nesting Level ${active.workflow.flatSteps[active.state.step]?.level ?? 0})` : void 0;
  const wfName = resolved.workflow.name;
  const prompt = visualizeWorkflowPrompt(
    wfName,
    resolved.workflow,
    resolved.filePath,
    activeStepIndex,
    statusHeader
  );
  return {
    active,
    response: injectSystemMessage(prompt)
  };
}

// src/actions/stop.ts
function stopWorkflow(_info, active) {
  const result = stopWorkflowState(
    active?.state ?? null,
    active?.workflow.name
  );
  if (!result.wasRunning || !active || !result.state) {
    return {
      active,
      response: injectSystemMessage(
        "[WORKFLOW STATUS]\nNo workflow is currently running."
      )
    };
  }
  return {
    active: {
      workflow: active.workflow,
      state: result.state
    },
    response: injectSystemMessage(
      `[WORKFLOW STOPPED]
Workflow "${result.workflowName}" has been stopped.`
    )
  };
}

// src/handlers/pre.ts
function handleCommand(info, active, parsedCmd) {
  if (parsedCmd.error) {
    return {
      active,
      response: injectSystemMessage(
        "CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER: " + (parsedCmd.helpText || `[Workflow Error] ${parsedCmd.error}`)
      )
    };
  }
  if (!parsedCmd.command) {
    return { active, response: {} };
  }
  switch (parsedCmd.command.name) {
    case "help": {
      const paused = pauseWorkflow(active?.state ?? null);
      const nextActive = active && paused ? { workflow: active.workflow, state: paused } : active;
      return {
        active: nextActive,
        response: injectSystemMessage(parsedCmd.helpText || getHelpText())
      };
    }
    case "show": {
      const paused = pauseWorkflow(active?.state ?? null);
      const nextActive = active && paused ? { workflow: active.workflow, state: paused } : active;
      return show(info, nextActive, parsedCmd.command);
    }
    case "next":
      return nextPre(info, active);
    case "stop":
      return stopWorkflow(info, active);
    case "run":
      return run(info, active, parsedCmd.command);
  }
}
function dispatchStep(info, active) {
  const currentStep = active.workflow.flatSteps[active.state.step];
  if (!currentStep) {
    return { active, response: {} };
  }
  return step(info, active);
}
function handlePre(info, active) {
  if (info.latestMessage && info.latestMessage.type === "USER_INPUT") {
    const parsedCmd = parseCommand(info.latestMessage.content);
    if (parsedCmd.isWfCommand) {
      return handleCommand(info, active, parsedCmd);
    }
    if (active?.state.status === "active") {
      logDebug("User message received, pausing workflow", {
        text: info.latestMessage.content.slice(0, 50)
      });
      const paused = pauseWorkflow(active.state);
      return {
        active: paused ? { workflow: active.workflow, state: paused } : active,
        response: {}
      };
    }
    return { active, response: {} };
  }
  if (active?.state.status !== "active") {
    return { active, response: {} };
  }
  const maxIterations = active.workflow.flatSteps.length * 5;
  if (active.state.iterationCount >= maxIterations) {
    const errorState = failWorkflow(
      active.state,
      `Workflow terminated: Exceeded safety iteration limit (${maxIterations}).`
    );
    return {
      active: errorState ? { workflow: active.workflow, state: errorState } : active,
      response: injectSystemMessage(
        `[WORKFLOW RUNNER] Workflow terminated: Exceeded safety iteration limit (${maxIterations}).`
      )
    };
  }
  return dispatchStep(info, active);
}

// src/actions/condition.ts
function conditionStop(info, active) {
  assert(
    active?.state.status === "active",
    "conditionStop requires an active workflow"
  );
  const currentStep = active.workflow.flatSteps[active.state.step];
  assert(
    currentStep?.type === "condition",
    "conditionStop requires current step to be a condition"
  );
  const totalSteps = active.workflow.flatSteps.length;
  const modelText = info.latestMessage?.content ?? "";
  const decision = parseDecision(modelText);
  logDebug("Condition evaluated (Stop)", {
    condition: currentStep.condition,
    decision
  });
  const nextState = advanceStep(
    active.workflow.flatSteps,
    active.state,
    decision
  );
  assert(nextState, "advanceStep must return next state for active workflow");
  const nextActive = { ...active, state: nextState };
  if (nextState.status === "finished") {
    logDebug("All workflow steps complete after condition", { totalSteps });
    return {
      active: nextActive,
      response: { decision: "allow" }
    };
  }
  if (nextState.status === "error") {
    logDebug("Condition workflow terminated on error", {
      error: nextState.error
    });
    return {
      active: nextActive,
      response: { decision: "allow" }
    };
  }
  const nextTargetStep = active.workflow.flatSteps[nextState.step];
  const nextStepNum = nextState.step + 1;
  const reason = formatAdvanceReason(nextTargetStep, active.workflow.preamble);
  logDebug("Advancing after condition (auto)", {
    nextNum: nextStepNum,
    totalSteps,
    level: nextTargetStep.level
  });
  return {
    active: nextActive,
    response: {
      decision: "continue",
      reason
    }
  };
}

// src/handlers/stop.ts
function handleStop(info, active) {
  if (active?.state.status !== "active") {
    return { active, response: { decision: "allow" } };
  }
  if (info.payload.error || info.payload.terminationReason && /error/i.test(info.payload.terminationReason)) {
    const errorMsg = info.payload.error || `Stopped with reason: ${info.payload.terminationReason}`;
    logDebug("Setting error state due to error termination", info.payload);
    const errorState = failWorkflow(active.state, errorMsg);
    return {
      active: errorState ? { workflow: active.workflow, state: errorState } : active,
      response: { decision: "allow" }
    };
  }
  if (info.payload.terminationReason && /cancel|abort|interrupt/i.test(info.payload.terminationReason)) {
    logDebug("Allowing stop due to interruption", info.payload);
    const paused = pauseWorkflow(active.state);
    return {
      active: paused ? { workflow: active.workflow, state: paused } : active,
      response: { decision: "allow" }
    };
  }
  const currentStep = active.workflow.flatSteps[active.state.step];
  if (!currentStep) {
    return { active, response: { decision: "allow" } };
  }
  if (currentStep.type === "condition") {
    return conditionStop(info, active);
  }
  return nextStop(info, active);
}

// src/wf.ts
function handle(info, active) {
  if (info.type === "stop") {
    return handleStop(info, active);
  } else if (info.type === "pre") {
    return handlePre(info, active);
  }
  throw new Error(`Unknown hook type: ${info.type}`);
}

// src/shim/stdin.ts
function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}
function parseJsonSafe(raw) {
  const clean = stripBom(raw).trim();
  if (!clean) return {};
  try {
    return JSON.parse(clean);
  } catch {
    return {};
  }
}
function readStdin(timeoutMs = 1e3, stream = process.stdin) {
  return new Promise((resolve2) => {
    let buffer = "";
    let settled = false;
    function onData(chunk) {
      if (settled) return;
      buffer += chunk.toString();
    }
    function done() {
      if (settled) return;
      settled = true;
      stream.removeListener("data", onData);
      stream.removeListener("end", done);
      stream.removeListener("error", done);
      clearTimeout(timer);
      resolve2(stripBom(buffer));
    }
    stream.on("data", onData);
    stream.on("end", done);
    stream.on("error", done);
    const timer = setTimeout(done, timeoutMs);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });
}

// src/shim/runtime-shim.ts
async function runShim(modeArg, rawInput, env = process.env) {
  const input = rawInput !== void 0 ? rawInput : await readStdin();
  const payload = parseJsonSafe(input);
  const harnessId = detectHarness(payload, env);
  if (!harnessId) {
    return { exitCode: 0 };
  }
  const adapter = getHarness(harnessId);
  const event = adapter.normalize(payload, modeArg, env);
  logDebug.conversationId = event.conversationId;
  const rawTranscript = event.rawPayload.transcriptPath ?? event.rawPayload.transcript_path;
  const transcriptPath = typeof rawTranscript === "string" ? rawTranscript : void 0;
  const artifactDirectoryPath = typeof event.rawPayload.artifactDirectoryPath === "string" ? event.rawPayload.artifactDirectoryPath : void 0;
  const hookInfo = {
    type: event.type === "stop" ? "stop" : "pre",
    payload: {
      conversationId: event.conversationId,
      workspacePaths: [event.workspacePath],
      transcriptPath,
      artifactDirectoryPath,
      terminationReason: event.terminationReason,
      ...event.rawPayload
    },
    latestMessage: event.latestMessage
  };
  const active = loadActiveWorkflow(event.conversationId, env);
  const { active: nextActive, response } = handle(hookInfo, active);
  if (nextActive !== null && nextActive !== active) {
    logDebug(`> Handled ${hookInfo.type}`, {
      payload: event.rawPayload,
      state: active?.state,
      nextState: nextActive.state,
      response
    });
    if (!active || active.workflow !== nextActive.workflow) {
      saveWorkflow(event.conversationId, nextActive.workflow, env);
    }
    saveState(event.conversationId, nextActive.state, env);
  }
  return adapter.formatEgress(event, response);
}

// src/validator-checks.ts
function checkWorkflowName(def) {
  if (!def.name || def.name.trim().length === 0) {
    return [
      {
        id: "workflow-missing-name",
        description: 'Workflow must define a non-empty name (via YAML frontmatter "name" or Markdown H1 title).',
        source: { type: "workflow" }
      }
    ];
  }
  return [];
}
function checkWorkflowSteps(def) {
  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    return [
      {
        id: "workflow-no-steps",
        description: "Workflow contains no actionable steps.",
        source: { type: "workflow" }
      }
    ];
  }
  return [];
}
function checkStepTitle(step2) {
  const title = step2.title?.trim();
  if (!title) {
    return [
      {
        id: "step-missing-title",
        description: "Step title cannot be empty.",
        source: { type: "step", title: step2.title || "" }
      }
    ];
  }
  return [];
}
function checkActionStepInstruction(step2) {
  if (step2.type === "step" && (!step2.instruction || step2.instruction.trim().length === 0)) {
    const title = step2.title?.trim() || "untitled";
    return [
      {
        id: "step-action-empty-instruction",
        description: `Action step "${title}" has empty instructions.`,
        source: { type: "step", title }
      }
    ];
  }
  return [];
}
function checkGateStepInstruction(step2) {
  if (step2.type === "gate" && (!step2.instruction || step2.instruction.trim().length === 0)) {
    const title = step2.title?.trim() || "untitled";
    return [
      {
        id: "step-gate-empty-instruction",
        description: `Gate step "${title}" has empty verification instructions.`,
        source: { type: "step", title }
      }
    ];
  }
  return [];
}
function checkConditionStepExpression(step2) {
  if (step2.type === "condition") {
    const condStep = step2;
    if (!condStep.condition || condStep.condition.trim().length === 0) {
      const title = step2.title?.trim() || "untitled";
      return [
        {
          id: "step-condition-empty-expression",
          description: `Condition step "${title}" has an empty condition expression.`,
          source: { type: "step", title }
        }
      ];
    }
  }
  return [];
}
function checkConditionStepYes(step2) {
  if (step2.type === "condition") {
    const condStep = step2;
    if (!condStep.yes || !Array.isArray(condStep.yes.steps) || condStep.yes.steps.length === 0) {
      const title = step2.title?.trim() || "untitled";
      return [
        {
          id: "step-condition-empty-yes",
          description: `Condition step "${title}" has no YES branch steps.`,
          source: { type: "step", title }
        }
      ];
    }
  }
  return [];
}
function checkConditionStepNo(step2) {
  if (step2.type === "condition") {
    const condStep = step2;
    if (condStep.no && (!condStep.no.steps || condStep.no.steps.length === 0)) {
      const title = step2.title?.trim() || "untitled";
      return [
        {
          id: "step-condition-empty-no",
          description: `Condition step "${title}" defines an empty NO branch.`,
          source: { type: "step", title }
        }
      ];
    }
  }
  return [];
}
var WORKFLOW_CHECKS = [checkWorkflowName, checkWorkflowSteps];
var STEP_CHECKS = [
  checkStepTitle,
  checkActionStepInstruction,
  checkGateStepInstruction,
  checkConditionStepExpression,
  checkConditionStepYes,
  checkConditionStepNo
];

// src/validator.ts
var PROBLEM_SEVERITY = {
  "workflow-missing-name": "error",
  "workflow-no-steps": "error",
  "step-missing-title": "error",
  "step-action-empty-instruction": "error",
  "step-gate-empty-instruction": "error",
  "step-condition-empty-expression": "error",
  "step-condition-empty-yes": "error",
  "step-condition-empty-no": "warning"
};
function validateWorkflow(def) {
  const problems = [];
  for (const check of WORKFLOW_CHECKS) {
    for (const p of check(def)) {
      problems.push({ ...p, type: PROBLEM_SEVERITY[p.id] });
    }
  }
  let totalSteps = 0;
  let linearSteps = 0;
  let conditions = 0;
  let gates = 0;
  if (Array.isArray(def.steps)) {
    let validateStep = function(step2) {
      totalSteps++;
      if (step2.type === "step") {
        linearSteps++;
      } else if (step2.type === "gate") {
        gates++;
      } else if (step2.type === "condition") {
        conditions++;
      }
      for (const check of STEP_CHECKS) {
        for (const p of check(step2)) {
          problems.push({ ...p, type: PROBLEM_SEVERITY[p.id] });
        }
      }
      if (step2.type === "condition") {
        const condStep = step2;
        if (condStep.yes?.steps) {
          for (const child of condStep.yes.steps) {
            validateStep(child);
          }
        }
        if (condStep.no?.steps) {
          for (const child of condStep.no.steps) {
            validateStep(child);
          }
        }
      }
    };
    for (const step2 of def.steps) {
      validateStep(step2);
    }
  }
  const valid = !problems.some((p) => p.type === "error");
  return {
    valid,
    stats: { totalSteps, linearSteps, conditions, gates },
    problems
  };
}

// src/cli.ts
function getCliHelp() {
  return [
    "wf - Workflow Runner CLI",
    "",
    "Usage:",
    "  wf hook <event>       Execute harness lifecycle hook (pre, stop)",
    "  wf compile <file>     Compile workflow to JSON",
    "  wf start <file>       Start a workflow from a Markdown or JSON file",
    "  wf show [<file>]      Show workflow status, mermaid diagram, and current step",
    "  wf next               Execute the next step of a paused workflow",
    "  wf stop               Stop and reset the active workflow",
    "  wf help               Show this help reference",
    "",
    "Options:",
    "  --check               Validate workflow without outputting JSON",
    "  -h, --help            Show help",
    "  -v, --version         Show version"
  ].join("\n");
}
function parseCliArgs(args = process.argv.slice(2)) {
  const { values, positionals } = (0, import_node_util.parseArgs)({
    args,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      check: { type: "boolean" }
    },
    allowPositionals: true,
    strict: false
  });
  return {
    command: positionals[0],
    subcommand: positionals[1],
    args: positionals.slice(1),
    options: values
  };
}
async function runCli(args = process.argv.slice(2), io = {}) {
  const parsed = parseCliArgs(args);
  const env = io.env || process.env;
  const writeOut = io.stdout || ((msg) => console.log(msg));
  const writeErr = io.stderr || ((msg) => console.error(msg));
  if (parsed.options.help || parsed.command === "help") {
    const help = getCliHelp();
    writeOut(help);
    return { exitCode: 0, output: help };
  }
  if (parsed.options.version || parsed.command === "version") {
    const ver = "0.1.0";
    writeOut(ver);
    return { exitCode: 0, output: ver };
  }
  if (parsed.command === "hook") {
    const event = parsed.subcommand;
    if (!event || event !== "pre" && event !== "stop") {
      const err2 = `[wf error] Missing or unsupported hook event: "${event || ""}". Expected "pre" or "stop".`;
      writeErr(err2);
      return { exitCode: 1, output: err2 };
    }
    const egress = await runShim(event, io.stdin, env);
    if (io.stdout) {
      if (egress.stdout) writeOut(egress.stdout);
      if (egress.stderr && io.stderr) io.stderr(egress.stderr);
    } else {
      if (egress.stdout) process.stdout.write(egress.stdout);
      if (egress.stderr) process.stderr.write(egress.stderr);
      process.exit(egress.exitCode);
    }
    return { exitCode: egress.exitCode, output: egress.stdout };
  }
  if (parsed.command === "compile") {
    const filePath = parsed.args[0];
    if (!filePath) {
      const err2 = "Missing required argument: <workflow-file>";
      writeErr(err2);
      return { exitCode: 1, output: err2 };
    }
    const cwd = env.PWD || process.cwd();
    const resolved = defaultWorkflowResolver(filePath, [cwd]);
    if (!resolved || "error" in resolved) {
      const err2 = !resolved ? `Workflow file not found: "${filePath}".` : resolved.error;
      writeErr(err2);
      return { exitCode: 1, output: err2 };
    }
    const result = validateWorkflow(resolved.workflow);
    const errors = result.problems.filter((p) => p.type === "error");
    const warnings = result.problems.filter((p) => p.type === "warning");
    if (!result.valid) {
      const lines = [
        `[WORKFLOW INVALID] Validation failed for "${resolved.workflow.name}":`
      ];
      for (const e of errors) {
        lines.push(`  - [ERROR] ${e.description}`);
      }
      if (warnings.length > 0) {
        lines.push("\nWarnings:");
        for (const w of warnings) {
          lines.push(`  - [WARN] ${w.description}`);
        }
      }
      const out = lines.join("\n");
      writeErr(out);
      return { exitCode: 1, output: out };
    }
    if (parsed.options.check) {
      const lines = [
        `[WORKFLOW VALID] "${resolved.workflow.name}" is valid.`,
        `Steps: ${result.stats.totalSteps} (${result.stats.linearSteps} linear, ${result.stats.conditions} condition, ${result.stats.gates} gate)`,
        `File: ${resolved.filePath}`
      ];
      if (warnings.length > 0) {
        lines.push("\nWarnings:");
        for (const w of warnings) {
          lines.push(`  - [WARN] ${w.description}`);
        }
      }
      const out = lines.join("\n");
      writeOut(out);
      return { exitCode: 0, output: out };
    }
    if (warnings.length > 0) {
      for (const w of warnings) {
        writeErr(`[WARN] ${w.description}`);
      }
    }
    const compiledJson = JSON.stringify(resolved.workflow, null, 2);
    writeOut(compiledJson);
    return { exitCode: 0, output: compiledJson };
  }
  if (parsed.command === "show" && parsed.args[0]) {
    const filePath = parsed.args[0];
    const cwd = env.PWD || process.cwd();
    const resolved = defaultWorkflowResolver(filePath, [cwd]);
    if (!resolved || "error" in resolved) {
      const err2 = !resolved ? `Workflow file not found: "${filePath}".` : resolved.error;
      writeErr(err2);
      return { exitCode: 1, output: err2 };
    }
    const prompt = visualizeWorkflowPrompt(
      resolved.workflow.name,
      resolved.workflow,
      resolved.filePath
    );
    writeOut(prompt);
    return { exitCode: 0, output: prompt };
  }
  const STATEFUL_COMMANDS = /* @__PURE__ */ new Set(["stop", "start", "run", "next", "show"]);
  if (parsed.command && STATEFUL_COMMANDS.has(parsed.command)) {
    const conversationId = resolveConversationIdFromHarnesses(env);
    if (!conversationId) {
      const err2 = "[wf error] Unable to resolve active conversation ID from harness environment.";
      writeErr(err2);
      return { exitCode: 1, output: err2 };
    }
    logDebug.conversationId = conversationId;
    if (parsed.command === "stop") {
      const active = loadActiveWorkflow(conversationId, env);
      const result = stopWorkflowState(
        active?.state ?? null,
        active?.workflow.name
      );
      if (result.state !== null) {
        saveState(conversationId, result.state, env);
      }
      const msg = result.wasRunning ? `[WORKFLOW STOPPED] Workflow "${result.workflowName}" has been stopped.` : "[WORKFLOW STATUS] No workflow is currently running.";
      writeOut(msg);
      return { exitCode: 0, output: msg };
    }
    if (parsed.command === "start" || parsed.command === "run") {
      const filePath = parsed.args[0];
      if (!filePath) {
        const err2 = "Missing required argument: <workflow-file>";
        writeErr(err2);
        return { exitCode: 1, output: err2 };
      }
      const cwd = env.PWD || process.cwd();
      const resolved = defaultWorkflowResolver(filePath, [cwd]);
      if (!resolved || "error" in resolved) {
        const err2 = !resolved ? `Workflow file not found: "${filePath}".` : resolved.error;
        writeErr(err2);
        return { exitCode: 1, output: err2 };
      }
      const compiled = compileWorkflow(resolved.workflow, resolved.filePath);
      if (compiled.flatSteps.length === 0) {
        const err2 = `Workflow file "${filePath}" contains no executable steps.`;
        writeErr(err2);
        return { exitCode: 1, output: err2 };
      }
      const nextActive = startWorkflow(compiled);
      saveWorkflow(conversationId, nextActive.workflow, env);
      saveState(conversationId, nextActive.state, env);
      const firstStep = compiled.flatSteps[0];
      const msg = `[WORKFLOW STARTED] "${nextActive.workflow.name}"
Step 1/${compiled.flatSteps.length}: ${firstStep.title}
${firstStep.instruction}`;
      writeOut(msg);
      return { exitCode: 0, output: msg };
    }
    if (parsed.command === "next") {
      const active = loadActiveWorkflow(conversationId, env);
      if (!active || active.state.status !== "active" && active.state.status !== "paused") {
        const err2 = "No workflow is loaded. Start a workflow with 'wf start <workflow-file>'.";
        writeErr(err2);
        return { exitCode: 1, output: err2 };
      }
      const nextState = resumeWorkflow(active.workflow.flatSteps, active.state);
      saveState(conversationId, nextState, env);
      if (nextState.status === "finished") {
        const msg2 = `[WORKFLOW STATUS: FINISHED]
Workflow "${active.workflow.name}" completed successfully.`;
        writeOut(msg2);
        return { exitCode: 0, output: msg2 };
      }
      const currentStep = active.workflow.flatSteps[nextState.step];
      const stepNum = nextState.step + 1;
      const total = active.workflow.flatSteps.length;
      const title = currentStep?.title || `Step ${stepNum}`;
      const msg = `[STEP ${stepNum}/${total}] ${title}
${currentStep?.instruction || ""}`;
      writeOut(msg);
      return { exitCode: 0, output: msg };
    }
    if (parsed.command === "show") {
      const active = loadActiveWorkflow(conversationId, env);
      if (!active) {
        const msg = "[WORKFLOW STATUS]\nNo workflow is currently loaded.";
        writeOut(msg);
        return { exitCode: 0, output: msg };
      }
      const currentStep = active.workflow.flatSteps[active.state.step];
      const currentLevel = currentStep?.level ?? 0;
      const stepInfo = active.state.status !== "finished" ? `Step: ${active.state.step + 1} of ${active.workflow.flatSteps.length} (Nesting Level ${currentLevel})` : "All steps completed";
      const statusHeader = `[WORKFLOW STATUS: ${active.state.status.toUpperCase()}]
Workflow: ${active.workflow.name}
${stepInfo}`;
      const prompt = visualizeWorkflowPrompt(
        active.workflow.name,
        active.workflow,
        active.workflow.filePath,
        active.state.status === "active" || active.state.status === "paused" ? active.state.step : void 0,
        statusHeader
      );
      writeOut(prompt);
      return { exitCode: 0, output: prompt };
    }
  }
  if (!parsed.command) {
    const help = getCliHelp();
    writeOut(help);
    return { exitCode: 0, output: help };
  }
  const err = `Unknown command: "${parsed.command}". Run "wf --help" for available commands.`;
  writeErr(err);
  return { exitCode: 1, output: err };
}
var isCliEntry = Boolean(process.argv[1]) && (process.argv[1].endsWith("cli.ts") || process.argv[1].endsWith("wf.cjs") || process.argv[1].endsWith("/wf") || process.argv[1].endsWith("\\wf"));
if (isCliEntry) {
  runCli().then(({ exitCode }) => {
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  }).catch((err) => {
    logDebug("Unexpected CLI error", err);
    process.exit(1);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getCliHelp,
  parseCliArgs,
  runCli
});
