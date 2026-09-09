import type { ChatInputCommandInteraction, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import * as submit from './submit.js';
import * as daily from './daily.js';
import * as myuploads from './myuploads.js';

export interface Command {
  // Builder subtypes differ once options are added (SlashCommandBuilder vs
  // SlashCommandOptionsOnlyBuilder etc.) — all of them share this much, which is all register.ts
  // and the interaction dispatcher in index.ts actually need.
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export const commands: Command[] = [submit, daily, myuploads];
