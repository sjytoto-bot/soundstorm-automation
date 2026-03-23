/**
 * SOUNDSTORM OS — Proposal Validator
 *
 * Validates AI-generated JSON proposals against proposal.schema.json.
 * Does NOT access state.json. Does NOT execute any actions.
 * Validation only.
 */

import Ajv, { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const schema = JSON.parse(
  readFileSync(join(__dirname, "../schemas/proposal.schema.json"), "utf-8")
);

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validate: ValidateFunction = ajv.compile(schema);

/**
 * Validates a proposal object against the SOUNDSTORM proposal schema.
 *
 * @param proposal - Unknown input to validate
 * @returns true if valid
 * @throws Error with detailed messages if invalid
 */
export function validateProposal(proposal: unknown): true {
  const valid = validate(proposal);

  if (!valid) {
    const messages = (validate.errors ?? [])
      .map(e => `  ${e.instancePath || "(root)"}: ${e.message}`)
      .join("\n");
    throw new Error(`Proposal validation failed:\n${messages}`);
  }

  return true;
}
