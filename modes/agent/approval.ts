import type { ActionTracker } from "./action-tracker";
import chalk from "chalk";
import {select, isCancel} from '@clack/prompts'
import type { ActionLog } from "./types";
import { composeBeforeAfter, formatPatch } from "./diff-view";
import { renderTerminalMarkdown } from "../../tui/terminal-md";

interface ReviewGroup{
    label:string;
    actionIds:string[],
    patch:string | null
}

function groupPending(pending: ActionLog[]): ReviewGroup[] {
    const byPath = new Map<string, ActionLog[]>();
    const shells: ActionLog[] = [];

    for (const a of pending) {
        if (a.type === "tool_execute") {
        shells.push(a);
        continue;
        }
        const key = a.path;
        if (!byPath.has(key)) byPath.set(key, []);
        byPath.get(key)!.push(a);
    }

    const groups: ReviewGroup[] = [];

    const pathEntries = [...byPath.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
    );
    for (const [p, acts] of pathEntries) {
        const sorted = acts.sort(
        (x, y) => x.timestamp.getTime() - y.timestamp.getTime(),
        );
        const ids = sorted.map((x) => x.id);

        if (sorted.every((x) => x.type === "folder_create")) {
        groups.push({
            label: `Create folder: ${p}`,
            actionIds: ids,
            patch: null,
        });
        continue;
        }

        const { before, after } = composeBeforeAfter(sorted);
        const patch = formatPatch(p, before, after);
        const kinds = [...new Set(sorted.map((x) => x.type))].join(", ");
        groups.push({ label: `${p} (${kinds})`, actionIds: ids, patch });
    }

    for (const s of shells) {
        groups.push({
        label: `Shell: ${s.details.command ?? "(no command)"}`,
        actionIds: [s.id],
        patch: null,
        });
    }

    return groups;
}

/**
 * Run the approval flow for staged changes.
 * 
 * This function:
 * 1. Checks if there are any pending changes
 * 2. If none, returns false (nothing to approve)
 * 3. If yes, prompts user to approve all, review individually, or cancel
 * 4. Updates tracker with user's approval decisions
 * 5. Returns true if ANY changes were approved, false if all rejected/cancelled
 * 
 * @param tracker ActionTracker with pending mutations
 * @returns true if user approved any changes, false otherwise
 */
export async function runApprovalFlow(tracker: ActionTracker):Promise<boolean>{
    const pending = tracker.getPendingMutations()
    
    // No changes to review
    if(pending.length === 0){
        console.log(chalk.dim('\nNo staged file, folder or shell changes to review.\n'))
        return false  // ✓ Correct: nothing to approve
    }

    // Ask user how to proceed
    const choice = await select({
        message: "Apply staged changes?",
        options: [
            {value: "all", label: "Approve and apply all"},
            {value: "select", label: "Review one by one"},
            {value: "cancel", label: "Cancel"},
        ]
    })

    // User cancelled
    if(isCancel(choice) || choice === "cancel"){
        // Mark all as rejected
        for(const a of pending){
            tracker.updateStatus(a.id, "rejected", false)
        }
        return false  // ✓ Correct: user rejected all
    }

    // User selected "Approve all" - approve everything and return immediately
    if(choice === "all"){
        for(const a of pending){
            tracker.updateStatus(a.id, "approved", true)
        }
        return true  // ✓ IMPORTANT: return immediately without asking about each change
    }

    // User selected "Review one by one"
    // Groups changes by file for easier review
    const groups = groupPending(pending);
    
    for(const g of groups){
        // Keep asking about this group until user makes a choice
        while(true){
            const opt = await select({
                message: chalk.bold(g.label),
                options: [
                    { value: "accept", label: "Accept" },
                    { value: "diff", label: "Show diff", hint: g.patch ? "" : "N/A" },
                    { value: "reject", label: "Reject" },
                ],
            })

            // User hit Ctrl+C during review
            if(isCancel(opt)){
                for(const a of pending) {
                    tracker.updateStatus(a.id, "rejected", false)
                }
                return false
            }

            // User wants to see the diff
            if(opt === "diff"){
                if (g.patch) {
                    console.log(
                        "\n" +
                        renderTerminalMarkdown("```diff\n" + g.patch + "\n```\n") +
                        "\n",
                    );
                }
                // ✓ Loop continues, ask again for this group
                continue;
            }

            // User accepted or rejected this group
            // opt === "accept" or opt === "reject"
            for(const id of g.actionIds){
                tracker.updateStatus(
                    id, 
                    opt === "accept" ? "approved" : "rejected",
                    opt === "accept"
                )
            }
            
            // ✓ Break inner loop, move to next group
            break
        }
    }

    // ✓ Return true only if user approved ANY changes
    // If user rejected all, this returns false (nothing gets applied)
    return tracker.getActions().some((a) => a.status === "approved")
}