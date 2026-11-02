export type PlatformMediaAdmin = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  mediaCount: number;
};

export type CreatePlatformMediaAdmin = {
  name: string;
  email: string;
  initialPassword: string;
};
