export type PreferenceSet = {
  id: number;
  roleKey: string;
  name: string;
  content: string;
  sortOrder: number;
  usageCount: number;
};

export type Role = {
  key: string;
  label: string;
  defaultPreference: string;
  customPreference: string;
  roleProfileKey: string;
  roleProfileDescription: string;
  usageCount: number;
  preferenceSets: PreferenceSet[];
};

export type Contact = {
  id: number;
  name: string;
  roleMode: 'template' | 'custom';
  roleKey: string;
  rolePreferenceId: number | null;
  customRoleLabel: string;
  customRolePreference: string;
  deliveryType: 'generic_webhook' | 'dingtalk_robot';
  webhookUrl: string;
  dingtalkKeyword: string;
  dingtalkSecretConfigured: boolean;
  preference: string;
  active: boolean;
};

export type ContactInput = Omit<Contact, 'id' | 'dingtalkSecretConfigured'> & {
  dingtalkSecret?: string;
  clearDingtalkSecret?: boolean;
};

export type Draft = {
  generationRecordId: number;
  contact: Contact;
  role: Role;
  content: string;
};

export type ParsedInput = {
  inputRecordId: number;
  sourceType: string;
  filename: string;
  text: string;
  markdownFilename?: string;
};

export type RoleSuggestionInput = {
  roleLabel: string;
  preferenceSetName?: string;
  roleProfileKey?: string;
  roleProfileDescription?: string;
};

export type RoleProfile = {
  key: string;
  label: string;
  aliases: string[];
  description: string;
};

export type RoleRecognition = {
  source: 'preset' | 'deepseek';
  key: string;
  label: string;
  description: string;
};

export type PreferenceTemplate = {
  key: string;
  name: string;
  content: string;
};

export type RoleFocusPreset = {
  key: string;
  label: string;
  aliases: string[];
  defaultPreference: string;
  preferenceTemplates?: PreferenceTemplate[];
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error ?? `Request failed: ${response.status}`);
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean; deepseekConfigured: boolean; model: string }>('/api/health'),
  roles: () => request<Role[]>('/api/roles'),
  roleProfiles: () => request<RoleProfile[]>('/api/role-profiles'),
  roleFocusPresets: () => request<RoleFocusPreset[]>('/api/role-focus-presets'),
  resolveRoleProfile: (roleLabel: string) => request<RoleRecognition>('/api/role-profiles/resolve', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roleLabel }),
  }),
  createRole: (role: Pick<Role, 'label' | 'defaultPreference' | 'roleProfileKey' | 'roleProfileDescription'>) => request<Role>('/api/roles', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(role),
  }),
  updateRole: (key: string, role: Partial<Pick<Role, 'label' | 'defaultPreference' | 'roleProfileKey' | 'roleProfileDescription'>>) => request<Role>(`/api/roles/${key}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(role),
  }),
  generateRoleSuggestion: (input: RoleSuggestionInput) => request<{ content: string; source: 'preset' | 'deepseek' }>('/api/role-suggestions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  }),
  deleteRole: (key: string) => request<void>(`/api/roles/${key}`, { method: 'DELETE' }),
  createPreferenceSet: (roleKey: string, preferenceSet: Pick<PreferenceSet, 'name' | 'content' | 'sortOrder'>) =>
    request<PreferenceSet>(`/api/roles/${roleKey}/preference-sets`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(preferenceSet),
    }),
  updatePreferenceSet: (id: number, preferenceSet: Partial<Pick<PreferenceSet, 'name' | 'content' | 'sortOrder'>>) =>
    request<PreferenceSet>(`/api/preference-sets/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(preferenceSet),
    }),
  deletePreferenceSet: (id: number) => request<void>(`/api/preference-sets/${id}`, { method: 'DELETE' }),
  contacts: () => request<Contact[]>('/api/contacts'),
  createContact: (contact: ContactInput) => request<Contact>('/api/contacts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(contact),
  }),
  updateContact: (id: number, contact: Partial<ContactInput>) => request<Contact>(`/api/contacts/${id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(contact),
  }),
  updateContactsActive: (ids: number[], active: boolean) => request<{ contacts: Contact[] }>('/api/contacts/batch/active', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids, active }),
  }),
  deleteContact: (id: number) => request<void>(`/api/contacts/${id}`, { method: 'DELETE' }),
  deleteInactiveContacts: (ids: number[]) => request<{ deletedIds: number[] }>('/api/contacts/batch/inactive', {
    method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }),
  }),
  parseInput: (formData: FormData) => request<ParsedInput>('/api/inputs/parse', { method: 'POST', body: formData }),
  generate: (sourceText: string, inputRecordId: number | null, contactIds: number[]) => request<{ drafts: Draft[] }>('/api/generate', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceText, inputRecordId, contactIds }),
  }),
  send: (messages: Array<{ generationRecordId: number | null; contactId: number; content: string }>) =>
    request<{ results: Array<{ contactId: number; sendRecordId?: number; ok: boolean; status?: number; error?: string }> }>('/api/send', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }),
    }),
};
