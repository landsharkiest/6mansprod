import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { fetchUploads } from '../api.js';
import { formatUploadsReply } from '../lib/messages.js';

export const data = new SlashCommandBuilder()
  .setName('myuploads')
  .setDescription('List the clips you have submitted and their review status');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const uploads = await fetchUploads(interaction.user.id);
    await interaction.editReply(formatUploadsReply(uploads));
  } catch (err) {
    await interaction.editReply(`Couldn't fetch your uploads right now: ${(err as Error).message}`);
  }
}
