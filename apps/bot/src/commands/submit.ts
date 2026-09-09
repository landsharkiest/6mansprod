import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { RANKS, type Rank } from '@6mansdle/shared';
import { config } from '../config.js';
import { validateAttachment } from '../lib/attachment.js';
import { formatSubmitReply } from '../lib/messages.js';
import { completeUpload, presignUpload, uploadToPresignedUrl } from '../api.js';

export const data = new SlashCommandBuilder()
  .setName('submit')
  .setDescription('Submit a Rocket League clip for review')
  .addStringOption((opt) =>
    opt
      .setName('rank')
      .setDescription("The clip's actual rank")
      .setRequired(true)
      .addChoices(...RANKS.map((rank) => ({ name: rank, value: rank }))),
  )
  .addAttachmentOption((opt) =>
    opt.setName('clip').setDescription('Video clip (mp4, webm, or mov)').setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const rank = interaction.options.getString('rank', true) as Rank;
  const attachment = interaction.options.getAttachment('clip', true);

  const validationError = validateAttachment(
    { contentType: attachment.contentType, size: attachment.size },
    config.maxUploadBytes,
  );
  if (validationError) {
    await interaction.reply({ content: validationError, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const presign = await presignUpload({
      discordId: interaction.user.id,
      username: interaction.user.username,
      avatar: interaction.user.avatar,
      filename: attachment.name,
      contentType: attachment.contentType!,
      sizeBytes: attachment.size,
      rank,
    });
    // Stream straight from Discord's CDN to the presigned S3 PUT — the bot process never buffers
    // the whole clip in memory.
    await uploadToPresignedUrl(attachment.url, presign, attachment.contentType!);
    await completeUpload(interaction.user.id, presign.clipId);
    await interaction.editReply(formatSubmitReply(rank));
  } catch (err) {
    await interaction.editReply(`Couldn't submit that clip: ${(err as Error).message}`);
  }
}
