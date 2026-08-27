import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const operators = sqliteTable("operators", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("operators_email_unique").on(table.email)]);

export const mediaItems = sqliteTable("media_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["music", "ident", "commercial", "program"] }).notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  youtubeId: text("youtube_id").notNull(),
  sourceType: text("source_type", { enum: ["youtube", "upload"] }).notNull().default("youtube"),
  storageKey: text("storage_key"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  duration: integer("duration").notNull().default(30),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const playlistItems = sqliteTable("playlist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelId: text("channel_id").notNull(),
  mediaItemId: integer("media_item_id").notNull().references(() => mediaItems.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("playlist_channel_media_unique").on(table.channelId, table.mediaItemId)]);

export const playoutQueueItems = sqliteTable("playout_queue_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelId: text("channel_id").notNull(),
  mediaItemId: integer("media_item_id").notNull().references(() => mediaItems.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const channelSettings = sqliteTable("channel_settings", {
  channelId: text("channel_id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  shuffleEnabled: integer("shuffle_enabled", { mode: "boolean" }).notNull().default(true),
  commercialsEnabled: integer("commercials_enabled", { mode: "boolean" }).notNull().default(false),
  commercialIntervalMinutes: integer("commercial_interval_minutes").notNull().default(30),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const channelPlayout = sqliteTable("channel_playout", {
  channelId: text("channel_id").primaryKey(),
  currentMediaItemId: integer("current_media_item_id").references(() => mediaItems.id, { onDelete: "set null" }),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  endsAt: text("ends_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastCommercialAt: text("last_commercial_at"),
  sequence: integer("sequence").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const liveSessions = sqliteTable("live_sessions", {
  channelId: text("channel_id").primaryKey(),
  youtubeId: text("youtube_id").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const signalOverrides = sqliteTable("signal_overrides", {
  channelId: text("channel_id").primaryKey(),
  mode: text("mode", { enum: ["automation", "media", "live"] }).notNull().default("automation"),
  mediaItemId: integer("media_item_id").references(() => mediaItems.id, { onDelete: "set null" }),
  youtubeId: text("youtube_id"),
  title: text("title").notNull().default("Programación automática"),
  subtitle: text("subtitle").notNull().default(""),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  endsAt: text("ends_at"),
  updatedBy: text("updated_by").notNull().default(""),
});

export const controlLog = sqliteTable("control_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelId: text("channel_id").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull().default(""),
  operatorEmail: text("operator_email").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
