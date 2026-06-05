import chalk from "chalk";
import {select, isCancel} from "@clack/prompts"
import { runAgentMode } from "./agent/orchestrator";
import { runAskMode } from "./ask/orchestrator";
import { runPlanMode } from "./plan/orchestrator";
import { runMultiAgentMode } from "./multi/orchestrator";
import { runAutoMode } from "./auto";

export async function runCliMode () {
    while(true){
        const mode = await select({
            message: "Choose CLI mode:",
            options: [
                {value: "auto", label:"Auto Mode"},
                {value: "agent", label:"Agent Mode"},
                {value: "plan", label:"Plan Mode"},
                {value: "ask", label:"Ask Mode"},
                {value: "multi", label: "Multi-Agent Mode"},
                {value: "back", label:" ⬅ Back to main menu"},
            ]
        })
        if(isCancel(mode) || mode === "back") return

        if(mode==="agent"){
            await runAgentMode()
        }
        else if(mode==="plan"){
            await runPlanMode()
        }
        else if(mode==="ask"){
            await runAskMode()
        }
        else if(mode==="multi"){
            await runMultiAgentMode()
        }
        else if(mode==="auto"){
            await runAutoMode()
        }
        if(mode!=="agent" && mode!=="plan" && mode!=="ask" && mode!=="multi" && mode!="auto"){
            console.log(chalk.yellow('\n This mode is not implemented yet. \n'))
        }
    }
}