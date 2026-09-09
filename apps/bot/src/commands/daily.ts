import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { fetchDaily } from '../api.js';
import { formatDailyReply } from '../lib/messages.js';

export const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription("Today's 6mansdle daily challenge — number, date, and how many people have played");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  try {
    const meta = await fetchDaily();
    await interaction.editReply(formatDailyReply(meta));
  } catch (err) {
    await interaction.editReply(`Couldn't fetch the daily right now: ${(err as Error).message}`);
  }
}
