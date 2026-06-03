const { StateGraph, messageAnnotations } = require('./@lanchain/langgraph');
const { ChatGoogleGenerativeAI } = require('@lanchain/google-genai');
const {ToolsMessage} = require('@lanchain/core/messages');
const tools = require('./tools');


const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.0-flash',
    temperature: 0.5, // less value means more deterministic output
})

const graph = new StateGraph(MessageAnnotations)
.addNode('tools', async (state,config) => {
    const lastMessage = state.messages[state.messages.length - 1]

    const toolCalls = lastMessage.tool_calls

    const toolCallResults = await Promise.all(toolsCalls.map(async (call) => {
        const tool = tools[call.name]
        if (!tool) {
            throw new Error(`Tool ${call.name} not found`)
        }
        const toolInput = call.args

        const toolResult = await tool.invoke({ ...toolInput, token: config.metadata.token })

        return new ToolMessage({  content: toolResult,toolName: call.name})
    }))

    state.messages.push(...toolCallResults)
    return state

})