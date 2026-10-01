const { StateGraph, MessagesAnnotation } = require("@langchain/langgraph");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ToolMessage, AIMessage } = require("@langchain/core/messages");
const tools = require("./tools");

// Active tools list
const toolList = [
    tools.searchProducts,
    tools.getProductDetails,
    tools.getCart,
    tools.addProductToCart,
    tools.getUserOrders,
    tools.getOrderDetails
].filter(Boolean);

let overrideModel = null;

/**
 * Checks whether the AI provider has been configured via environment variables
 */
function isConfigured() {
    return !!(overrideModel || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
}

/**
 * Returns the active Chat Model (custom override or ChatGoogleGenerativeAI)
 */
function getActiveModel() {
    if (overrideModel) {
        return overrideModel;
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return null;
    }

    return new ChatGoogleGenerativeAI({
        model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
        temperature: 0.5,
        apiKey
    });
}

/**
 * Sets a custom model (useful for unit tests and provider mocks)
 */
function setModel(model) {
    overrideModel = model;
}

/**
 * Resets back to default environment-based model
 */
function resetModel() {
    overrideModel = null;
}

const graph = new StateGraph(MessagesAnnotation)
    .addNode("tools", async (state, config) => {
        const lastMessage = state.messages[state.messages.length - 1];
        const toolCalls = lastMessage.tool_calls || [];
        const token = config?.metadata?.token;

        const toolCallResults = await Promise.all(toolCalls.map(async (call) => {
            const tool = tools[call.name];
            if (!tool) {
                return new ToolMessage({
                    content: JSON.stringify({ error: `Tool '${call.name}' is not supported.` }),
                    name: call.name,
                    tool_call_id: call.id
                });
            }

            try {
                const toolResult = await tool.invoke(call.args, { metadata: { token } });
                return new ToolMessage({
                    content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
                    name: call.name,
                    tool_call_id: call.id
                });
            } catch (err) {
                return new ToolMessage({
                    content: JSON.stringify({ error: `Tool '${call.name}' execution failed: ${err.message}` }),
                    name: call.name,
                    tool_call_id: call.id
                });
            }
        }));

        return { messages: toolCallResults };
    })
    .addNode("chat", async (state, config) => {
        const model = getActiveModel();
        if (!model) {
            const err = new Error("AI provider is not configured. Please set GOOGLE_API_KEY in environment.");
            err.code = "AI_PROVIDER_UNAVAILABLE";
            throw err;
        }

        let response;
        try {
            if (typeof model.bindTools === 'function') {
                const bound = model.bindTools(toolList);
                response = await bound.invoke(state.messages);
            } else {
                response = await model.invoke(state.messages, { tools: toolList });
            }
        } catch (err) {
            console.error("[AI-Buddy] Model invocation error:", err.message);
            throw err;
        }

        const content = response.content || response.text || "";
        return {
            messages: [
                new AIMessage({
                    content: typeof content === 'string' ? content : JSON.stringify(content),
                    tool_calls: response.tool_calls || []
                })
            ]
        };
    })
    .addEdge("__start__", "chat")
    .addConditionalEdges("chat", (state) => {
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
            return "tools";
        }
        return "__end__";
    })
    .addEdge("tools", "chat");

const agent = graph.compile();

module.exports = agent;
module.exports.agent = agent;
module.exports.graph = graph;
module.exports.setModel = setModel;
module.exports.resetModel = resetModel;
module.exports.isConfigured = isConfigured;
module.exports.getActiveModel = getActiveModel;
module.exports.toolList = toolList;
