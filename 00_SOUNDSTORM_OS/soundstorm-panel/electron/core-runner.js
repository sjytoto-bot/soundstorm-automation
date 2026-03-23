/**
 * SOUNDSTORM OS — Core Bridge Runner
 *
 * main.js가 child_process.spawn("npx tsx core-runner.js <command> <id>")로 호출.
 * tsx가 TypeScript ESM 모듈을 직접 임포트하여 core 함수를 실행한다.
 *
 * 지원 명령:
 *   approve <proposal_id>  →  proposalQueueManager.markApproved()
 *   execute <proposal_id>  →  actionDispatcher.executeProposal()
 */

const [, , command, proposalId] = process.argv;

if (!command || !proposalId) {
  process.stderr.write("Usage: core-runner.js <approve|execute> <proposal_id>\n");
  process.exit(1);
}

async function main() {
  switch (command) {
    case "approve": {
      const { markApproved } = await import("../core/proposalQueueManager.ts");
      markApproved(proposalId);
      break;
    }
    case "execute": {
      const { executeProposal } = await import("../core/actionDispatcher.ts");
      executeProposal(proposalId);
      break;
    }
    default:
      throw new Error(`Unknown command: "${command}"`);
  }
}

main().catch(err => {
  process.stderr.write((err.message ?? String(err)) + "\n");
  process.exit(1);
});
