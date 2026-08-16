import type { Contact, RoleRow } from '../db.js';

export type DraftRequest = {
  sourceText: string;
  contact: Contact;
  role: RoleRow;
};

export type DraftResponse = {
  content: string;
};

export type RoleSuggestionRequest = {
  roleLabel: string;
  preferenceSetName?: string;
  roleProfileKey?: string;
  roleProfileDescription?: string;
};

export type RoleRecognitionRequest = {
  roleLabel: string;
};

export type RoleRecognitionResponse = {
  label: string;
  description: string;
};

export type DraftMessage = {
  role: 'system' | 'user';
  content: string;
};

export type TextModelProvider = {
  generateDraft(input: DraftRequest): Promise<DraftResponse>;
  generateRoleSuggestion(input: RoleSuggestionRequest): Promise<DraftResponse>;
  recognizeRole(input: RoleRecognitionRequest): Promise<RoleRecognitionResponse>;
};
