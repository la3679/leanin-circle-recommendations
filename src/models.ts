import { z } from 'zod';

const id = z.number().int().positive();
const count = z.number().int().nonnegative();
const timestamp = z.iso.datetime();
export const topicSchema = z.object({
  id, slug: z.string().min(1), label: z.string().min(1), domain: z.string(),
});
export const userSchema = z.object({
  id, first_name: z.string(), last_name: z.string(), has_photo: z.boolean(),
  bio: z.string().nullable(), job_title: z.string().nullable(),
  company: z.string().nullable(), industry: z.string().nullable(),
  location: z.string().nullable(), joined_at: timestamp,
  topic_interests: z.array(z.string()),
  profile_completeness: z.number().min(0).max(1),
});
export const circleSchema = z.object({
  id, name: z.string().min(1), slug: z.string().min(1),
  description: z.string().nullable(), topic: z.string().nullable(),
  tags: z.array(z.string()), cover_image_url: z.string().nullable(),
  format: z.enum(['in_person', 'virtual', 'hybrid']),
  access: z.enum(['public', 'unlisted']), join_policy: z.enum(['open', 'request']),
  max_members: id.nullable(), member_count: count,
  created_at: timestamp, last_activity_at: timestamp,
  feed_posts_30d: count, chat_messages_30d: count,
});
export const membershipSchema = z.object({
  user_id: id, circle_id: id, role: z.enum(['member', 'leader']), joined_at: timestamp,
});
export const activitySchema = z.object({
  id, circle_id: id, author_user_id: id, body: z.string(),
  reaction_count: count, comment_count: count, save_count: count, created_at: timestamp,
});

export type Topic = z.infer<typeof topicSchema>;
export type User = z.infer<typeof userSchema>;
export type Circle = z.infer<typeof circleSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type Activity = z.infer<typeof activitySchema>;
export interface Dataset {
  topics: Topic[];
  users: User[];
  circles: Circle[];
  memberships: Membership[];
  activity: Activity[];
}
export interface Snapshot extends Dataset { asOf: string }
