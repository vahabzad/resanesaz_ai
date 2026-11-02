export type MediaOnboardingContext = {
  canCreateMedia: boolean;
  name: string;
  hasMedia: boolean;
  impersonated: boolean;
};

export type CreateMediaInput = {
  name: string;
  logoMode: "generated" | "upload";
  logoData?: string;
  editorialViewpoint: string;
};

export type CreatedMedia = {
  id: string;
  name: string;
};
