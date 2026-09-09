import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands/index.js';
import { fetchDaily } from './api.js';
import { formatDailyAnnouncement } from './lib/messages.js';
import { DailyScheduler } from './lib/scheduler.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commandsByName = new Map(commands.map((command) => [command.data.name, command]));

/** Posts "New 6mansdle daily #N is live: <url>" into DAILY_CHANNEL_ID once per UTC day. */
async function postDailyAnnouncement(): Promise<void> {
  if (!config.DAILY_CHANNEL_ID) return;
  try {
    const meta = await fetchDaily();
    const channel = await client.channels.fetch(config.DAILY_CHANNEL_ID);
    if (channel && channel.isTextBased() && 'send' in channel) {
      await channel.send(formatDailyAnnouncement(meta));
    } else {
      console.error(`DAILY_CHANNEL_ID ${config.DAILY_CHANNEL_ID} is not a sendable text channel`);
    }
  } catch (err) {
    console.error('Failed to post the scheduled daily announcement', err);
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  if (config.DAILY_CHANNEL_ID) {
    new DailyScheduler(postDailyAnnouncement).start();
  } else {
    console.log('DAILY_CHANNEL_ID not set — scheduled daily post disabled.');
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commandsByName.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error executing /${interaction.commandName}`, err);
    const content = 'Something went wrong running that command.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(content).catch(() => {});
    } else {
      await interaction.reply({ content, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(config.DISCORD_BOT_TOKEN);
