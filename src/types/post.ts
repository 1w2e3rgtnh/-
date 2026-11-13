export interface Post {
  id: number;
  anonymous_id: string;
  content: string;
  likes: number;
  created_at: string;
  is_mine?: boolean;
}

export type RealtimeEvent =
  | {
      type: 'post:created';
      payload: Post;
    }
  | {
      type: 'post:updated';
      payload: Post;
    }
  | {
      type: 'post:deleted';
      payload: { id: number };
    };
