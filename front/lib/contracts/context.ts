// Frontend-owned representation of the versioned Backend API response.
export type MediaRole = "owner" | "admin" | "editor" | "journalist" | "publisher" | "viewer";

export type MediaSummary = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  role: MediaRole;
};

export type DashboardContext = {
  impersonated: boolean;
  isPlatformAdmin: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null | undefined;
  };
  media: MediaSummary[];
  activeMedia: MediaSummary;
};

export type PlatformContext = {
  user: DashboardContext["user"];
  isPlatformAdmin: boolean;
};
