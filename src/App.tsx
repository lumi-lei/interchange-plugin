import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import {
  Bell,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { api, type Contact, type ContactInput, type Draft, type Role, type RoleFocusPreset, type RoleProfile, type RoleRecognition } from './api';

type DraftState = Draft & { selected: boolean; editedContent: string; sendStatus?: string };
type ContactStatusFilter = 'active' | 'inactive' | 'all';

type AceternityCardProps = {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'article';
};

const blankContact = (roleKey = ''): ContactInput => ({
  name: '',
  roleMode: 'template',
  roleKey,
  rolePreferenceId: null,
  customRoleLabel: '',
  customRolePreference: '',
  deliveryType: 'generic_webhook',
  webhookUrl: '',
  dingtalkKeyword: '',
  preference: '',
  active: true,
});

function normalizeRoleName(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s_\-—（）()[\]{}.,，。:：/\\]+/g, '');
}

function matchedRoleProfile(label: string, profiles: RoleProfile[]) {
  const normalized = normalizeRoleName(label);
  return profiles.find((profile) => [profile.label, ...profile.aliases].some((alias) => normalizeRoleName(alias) === normalized)) ?? null;
}

function matchedRoleFocusPreset(label: string, presets: RoleFocusPreset[]) {
  const normalized = normalizeRoleName(label);
  return presets.find((preset) => [preset.label, ...preset.aliases].some((alias) => normalizeRoleName(alias) === normalized)) ?? null;
}

function AceternityCard({ children, className = '', as = 'section' }: AceternityCardProps) {
  const Component = as;

  function updateSpotlight(event: MouseEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`);
  }

  return (
    <Component className={`aceternity-card ${className}`} onMouseMove={updateSpotlight}>
      <span className="card-spotlight" aria-hidden="true" />
      <div className="card-content">{children}</div>
    </Component>
  );
}

export function App() {
  const [health, setHealth] = useState<{ deepseekConfigured: boolean; model: string } | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleProfiles, setRoleProfiles] = useState<RoleProfile[]>([]);
  const [roleFocusPresets, setRoleFocusPresets] = useState<RoleFocusPreset[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [sourceText, setSourceText] = useState('');
  const [markdownDownload, setMarkdownDownload] = useState<{ filename: string; text: string } | null>(null);
  const [inputRecordId, setInputRecordId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<DraftState[]>([]);
  const [copiedDraftId, setCopiedDraftId] = useState<number | null>(null);
  const [contactDraft, setContactDraft] = useState<ContactInput>(blankContact());
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [roleEditKey, setRoleEditKey] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleDefaultPreference, setNewRoleDefaultPreference] = useState('');
  const [newRoleProfileKey, setNewRoleProfileKey] = useState('');
  const [newRoleProfileDescription, setNewRoleProfileDescription] = useState('');
  const [newRoleRecognition, setNewRoleRecognition] = useState<RoleRecognition | null>(null);
  const [roleRecognitions, setRoleRecognitions] = useState<Record<string, RoleRecognition>>({});
  const [preferenceSetName, setPreferenceSetName] = useState('');
  const [preferenceSetContent, setPreferenceSetContent] = useState('');
  const [preferenceTemplateKey, setPreferenceTemplateKey] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contactRoleFilter, setContactRoleFilter] = useState('all');
  const [contactStatusFilter, setContactStatusFilter] = useState<ContactStatusFilter>('active');

  const roleMap = useMemo(() => new Map(roles.map((role) => [role.key, role])), [roles]);
  const currentRoleKey = roleEditKey || roles[0]?.key || '';
  const currentRole = roles.find((role) => role.key === currentRoleKey) ?? null;
  const currentRoleFocusPreset = useMemo(
    () => currentRole ? matchedRoleFocusPreset(currentRole.label, roleFocusPresets) : null,
    [currentRole, roleFocusPresets],
  );
  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLocaleLowerCase();
    return contacts.filter((contact) => {
      const matchesStatus =
        contactStatusFilter === 'all'
          || (contactStatusFilter === 'active' ? contact.active : !contact.active);
      const matchesRole = contactRoleFilter === 'all'
        || (contactRoleFilter === 'custom' ? contact.roleMode === 'custom' : contact.roleMode === 'template' && contact.roleKey === contactRoleFilter);
      const matchesSearch =
        !query
        || contact.name.toLocaleLowerCase().includes(query)
        || contact.webhookUrl.toLocaleLowerCase().includes(query)
        || contact.deliveryType.toLocaleLowerCase().includes(query);
      return matchesStatus && matchesRole && matchesSearch;
    });
  }, [contactRoleFilter, contactSearch, contactStatusFilter, contacts]);

  async function load() {
    setError('');
    const [healthData, roleData, profileData, focusPresetData, contactData] = await Promise.all([
      api.health(), api.roles(), api.roleProfiles(), api.roleFocusPresets(), api.contacts(),
    ]);
    setHealth(healthData);
    setRoles(roleData);
    setRoleProfiles(profileData);
    setRoleFocusPresets(focusPresetData);
    setContacts(contactData);
    setSelectedContactIds((current) => current.length ? current : contactData.filter((c) => c.active).map((c) => c.id));
    setContactDraft(blankContact(roleData[0]?.key ?? ''));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function parseTextOrFile(file?: File) {
    setBusy('parse');
    setError('');
    try {
      const form = new FormData();
      if (file) form.append('file', file);
      else form.append('text', sourceText);
      const parsed = await api.parseInput(form);
      setSourceText(parsed.text);
      setMarkdownDownload(parsed.markdownFilename ? { filename: parsed.markdownFilename, text: parsed.text } : null);
      setInputRecordId(parsed.inputRecordId);
      setStatus(`已解析 ${parsed.filename || '手动输入'}，来源类型：${parsed.sourceType}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  function downloadConvertedMarkdown() {
    if (!markdownDownload) return;

    const blob = new Blob([markdownDownload.text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = markdownDownload.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function writeClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    textArea.remove();
  }

  async function copyDraftContent(draft: DraftState) {
    if (!draft.editedContent.trim()) {
      setError('待确认消息内容为空，无法复制');
      return;
    }

    try {
      await writeClipboard(draft.editedContent);
      setError('');
      setCopiedDraftId(draft.generationRecordId);
      setStatus(`${draft.contact.name} 的待确认消息已复制`);
      window.setTimeout(() => {
        setCopiedDraftId((current) => (current === draft.generationRecordId ? null : current));
      }, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制失败，请手动选择内容复制');
    }
  }

  async function generate() {
    setBusy('generate');
    setError('');
    setDrafts([]);
    try {
      const activeIds = selectedContactIds.filter((id) => contacts.some((contact) => contact.id === id && contact.active));
      const result = await api.generate(sourceText, inputRecordId, activeIds);
      setDrafts(result.drafts.map((draft) => ({ ...draft, selected: true, editedContent: draft.content })));
      setStatus(`已生成 ${result.drafts.length} 条角色化草稿`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function sendSelected() {
    setBusy('send');
    setError('');
    const messages = drafts
      .filter((draft) => draft.selected)
      .map((draft) => ({
        generationRecordId: draft.generationRecordId,
        contactId: draft.contact.id,
        content: draft.editedContent,
      }));
    try {
      const result = await api.send(messages);
      setDrafts((current) =>
        current.map((draft) => {
          const matched = result.results.find((item) => item.contactId === draft.contact.id);
          if (!matched) return draft;
          return {
            ...draft,
            sendStatus: matched.ok ? `已发送 HTTP ${matched.status}` : `发送失败：${matched.error ?? '未知错误'}`,
          };
        }),
      );
      setStatus(`发送完成：${result.results.filter((item) => item.ok).length}/${result.results.length} 成功`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function saveContact() {
    if (!contactDraft.name.trim()) return setError('联系人姓名不能为空');
    setBusy('contact');
    setError('');
    try {
      await api.createContact(contactDraft);
      setContactDraft(blankContact(roles[0]?.key ?? ''));
      await load();
      setStatus('联系人已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function updateContact(id: number, patch: Partial<ContactInput>) {
    const updated = await api.updateContact(id, patch);
    setContacts((current) => current.map((contact) => (contact.id === id ? updated : contact)));
    const roleAssociationChanged = ['roleMode', 'roleKey', 'rolePreferenceId'].some((key) => key in patch);
    if (roleAssociationChanged) {
      // 角色与偏好方案的使用人数依赖联系人关联，更新后立即同步以解除正确的删除保护。
      setRoles(await api.roles());
    }
    if (patch.active === false) {
      setSelectedContactIds((current) => current.filter((contactId) => contactId !== id));
    }
  }

  async function removeContact(id: number) {
    const contact = contacts.find((item) => item.id === id);
    if (contact?.active) {
      setError('请先停用收件人，再执行删除');
      return;
    }
    if (!window.confirm(`确定永久删除「${contact?.name || '未命名联系人'}」吗？`)) return;
    await api.deleteContact(id);
    setContacts((current) => current.filter((contact) => contact.id !== id));
    setSelectedContactIds((current) => current.filter((contactId) => contactId !== id));
    setStatus('联系人已删除');
  }

  async function updateFilteredContacts(active: boolean) {
    if (!filteredContacts.length) return;
    setBusy('contacts-batch');
    setError('');
    try {
      const { contacts: updatedContacts } = await api.updateContactsActive(
        filteredContacts.map((contact) => contact.id),
        active,
      );
      const updatedMap = new Map(updatedContacts.map((contact) => [contact.id, contact]));
      setContacts((current) => current.map((contact) => updatedMap.get(contact.id) ?? contact));
      if (!active) {
        const updatedIds = new Set(updatedContacts.map((contact) => contact.id));
        setSelectedContactIds((current) => current.filter((id) => !updatedIds.has(id)));
      }
      setStatus(`已${active ? '启用' : '停用'} ${updatedContacts.length} 位当前筛选收件人`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function deleteFilteredContacts() {
    if (!filteredContacts.length || filteredContacts.some((contact) => contact.active)) return;
    if (!window.confirm(`确定永久删除当前筛选出的 ${filteredContacts.length} 位停用收件人吗？`)) return;
    setBusy('contacts-batch');
    setError('');
    try {
      const { deletedIds: deletedContactIds } = await api.deleteInactiveContacts(
        filteredContacts.map((contact) => contact.id),
      );
      const deletedIds = new Set(deletedContactIds);
      setContacts((current) => current.filter((contact) => !deletedIds.has(contact.id)));
      setSelectedContactIds((current) => current.filter((id) => !deletedIds.has(id)));
      setStatus(`已删除 ${deletedIds.size} 位停用收件人`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function saveRole(role: Role) {
    let roleProfileKey = ['custom', 'deepseek'].includes(role.roleProfileKey) ? role.roleProfileKey : '';
    let roleProfileDescription = roleProfileKey ? role.roleProfileDescription : '';
    if (!roleProfileKey) {
      const recognized = await resolveAutomaticRoleProfile(role.label);
      roleProfileKey = recognized?.source === 'deepseek' ? 'deepseek' : '';
      roleProfileDescription = recognized?.source === 'deepseek' ? recognized.description : '';
    }
    const updated = await api.updateRole(role.key, {
      label: role.label,
      defaultPreference: role.defaultPreference,
      roleProfileKey,
      roleProfileDescription,
    });
    setRoles((current) => current.map((item) => (item.key === updated.key ? updated : item)));
    setStatus(`${role.label} 角色偏好已保存`);
  }

  async function createRole() {
    if (!newRoleLabel.trim()) return setError('请输入自定义角色名称');
    setBusy('role');
    setError('');
    try {
      const recognized = newRoleProfileKey === 'custom' ? null : newRoleRecognition ?? await resolveAutomaticRoleProfile(newRoleLabel);
      const role = await api.createRole({
        label: newRoleLabel,
        defaultPreference: newRoleDefaultPreference,
        roleProfileKey: newRoleProfileKey === 'custom' ? 'custom' : recognized?.source === 'deepseek' ? 'deepseek' : '',
        roleProfileDescription: newRoleProfileKey === 'custom' ? newRoleProfileDescription : recognized?.source === 'deepseek' ? recognized.description : '',
      });
      setRoles((current) => [...current, role]);
      setRoleEditKey(role.key);
      setNewRoleLabel('');
      setNewRoleDefaultPreference('');
      setNewRoleProfileKey('');
      setNewRoleProfileDescription('');
      setNewRoleRecognition(null);
      setStatus(`已新增角色：${role.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function resolveAutomaticRoleProfile(roleLabel: string): Promise<RoleRecognition | null> {
    const normalizedLabel = roleLabel.trim();
    if (!normalizedLabel) return null;
    const focusPreset = matchedRoleFocusPreset(normalizedLabel, roleFocusPresets);
    if (focusPreset) {
      return {
        source: 'preset',
        key: focusPreset.key,
        label: focusPreset.label,
        description: focusPreset.defaultPreference,
      };
    }
    const preset = matchedRoleProfile(normalizedLabel, roleProfiles);
    if (preset) {
      return { source: 'preset', key: preset.key, label: preset.label, description: preset.description };
    }
    return api.resolveRoleProfile(normalizedLabel);
  }

  async function recognizeNewRole() {
    if (!newRoleLabel.trim() || newRoleProfileKey === 'custom') return;
    setBusy('role-recognition');
    setError('');
    try {
      const recognized = await resolveAutomaticRoleProfile(newRoleLabel);
      setNewRoleRecognition(recognized);
      if (recognized?.source === 'deepseek') setStatus(`已由 DeepSeek 识别为：${recognized.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function recognizeSavedRole(role: Role) {
    if (role.roleProfileKey === 'custom' || !role.label.trim()) return;
    setBusy('role-recognition');
    setError('');
    try {
      const recognized = await resolveAutomaticRoleProfile(role.label);
      if (!recognized) return;
      setRoleRecognitions((current) => ({ ...current, [role.key]: recognized }));
      setRoles((items) => items.map((item) => item.key === role.key ? {
        ...item,
        roleProfileKey: recognized.source === 'deepseek' ? 'deepseek' : '',
        roleProfileDescription: recognized.source === 'deepseek' ? recognized.description : '',
      } : item));
      if (recognized.source === 'deepseek') setStatus(`已由 DeepSeek 识别为：${recognized.label}，请保存角色以应用`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function generateRoleSuggestion(
    roleLabel: string,
    preferenceSetName: string | undefined,
    roleProfileKey: string,
    roleProfileDescription: string,
    applySuggestion: (content: string) => void,
  ) {
    if (!roleLabel.trim()) {
      setError('请先填写角色名称');
      return;
    }
    if (preferenceSetName !== undefined && !preferenceSetName.trim()) {
      setError('请先填写偏好方案名称');
      return;
    }

    setBusy('role-suggestion');
    setError('');
    try {
      const { content, source } = await api.generateRoleSuggestion({
        roleLabel,
        ...(preferenceSetName !== undefined ? { preferenceSetName } : {}),
        ...(roleProfileKey ? { roleProfileKey } : {}),
        ...(roleProfileDescription ? { roleProfileDescription } : {}),
      });
      applySuggestion(content);
      setStatus(preferenceSetName !== undefined
        ? '已生成偏好方案内容建议，请确认后保存'
        : source === 'preset' ? '已应用本地关注点预设，请确认后保存' : '已生成默认关注点建议，请确认后保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  async function generateNewRoleDefaultPreference() {
    if (newRoleDefaultPreference.trim() && !window.confirm('生成的建议将覆盖当前默认关注点，是否继续？')) return;
    let profileKey = newRoleProfileKey;
    let profileDescription = newRoleProfileDescription;
    if (!profileKey) {
      setBusy('role-recognition');
      setError('');
      try {
        const recognized = newRoleRecognition ?? await resolveAutomaticRoleProfile(newRoleLabel);
        setNewRoleRecognition(recognized);
        if (recognized?.source === 'deepseek') {
          profileKey = 'deepseek';
          profileDescription = recognized.description;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      } finally {
        setBusy('');
      }
    }
    void generateRoleSuggestion(newRoleLabel, undefined, profileKey, profileDescription, setNewRoleDefaultPreference);
  }

  function generateCurrentRoleDefaultPreference(role: Role) {
    if (role.defaultPreference.trim() && !window.confirm('生成的建议将覆盖当前默认关注点，是否继续？')) return;
    const profileKey = ['custom', 'deepseek'].includes(role.roleProfileKey) ? role.roleProfileKey : '';
    void generateRoleSuggestion(role.label, undefined, profileKey, profileKey ? role.roleProfileDescription : '', (content) => {
      setRoles((items) => items.map((item) => (item.key === role.key ? { ...item, defaultPreference: content } : item)));
    });
  }

  function generatePreferenceSetContent(role: Role, name: string, currentContent: string, applySuggestion: (content: string) => void) {
    if (currentContent.trim() && !window.confirm('生成的建议将覆盖当前偏好方案内容，是否继续？')) return;
    const profileKey = ['custom', 'deepseek'].includes(role.roleProfileKey) ? role.roleProfileKey : '';
    void generateRoleSuggestion(role.label, name, profileKey, profileKey ? role.roleProfileDescription : '', applySuggestion);
  }

  async function deleteRole(role: Role) {
    if (!window.confirm(`确定删除“${role.label}”吗？`)) return;
    try {
      await api.deleteRole(role.key);
      setRoles((current) => current.filter((item) => item.key !== role.key));
      setRoleEditKey('');
      setStatus(`已删除角色：${role.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function createPreferenceSet(role: Role) {
    if (!preferenceSetName.trim() || !preferenceSetContent.trim()) return setError('请填写偏好方案名称和内容');
    try {
      await api.createPreferenceSet(role.key, {
        name: preferenceSetName,
        content: preferenceSetContent,
        sortOrder: role.preferenceSets.length,
      });
      setPreferenceSetName('');
      setPreferenceSetContent('');
      setPreferenceTemplateKey('');
      setRoles(await api.roles());
      setStatus(`已为 ${role.label} 新增偏好方案`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deletePreferenceSet(role: Role, preferenceSetId: number) {
    try {
      await api.deletePreferenceSet(preferenceSetId);
      setRoles(await api.roles());
      setStatus(`已删除 ${role.label} 的偏好方案`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function savePreferenceSet(preferenceSetId: number, name: string, content: string) {
    if (!name.trim() || !content.trim()) return setError('偏好方案名称和内容不能为空');
    try {
      await api.updatePreferenceSet(preferenceSetId, { name, content });
      setRoles(await api.roles());
      setStatus('偏好方案已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function movePreferenceSet(role: Role, index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    const current = role.preferenceSets[index];
    const target = role.preferenceSets[targetIndex];
    if (!current || !target) return;
    try {
      await Promise.all([
        api.updatePreferenceSet(current.id, { sortOrder: target.sortOrder }),
        api.updatePreferenceSet(target.id, { sortOrder: current.sortOrder }),
      ]);
      setRoles(await api.roles());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const selectedCount = selectedContactIds.filter((id) => contacts.some((contact) => contact.id === id && contact.active)).length;
  const canGenerate = sourceText.trim() && selectedCount > 0 && busy !== 'generate';
  const selectedDraftCount = drafts.filter((draft) => draft.selected).length;
  const activeContactCount = contacts.filter((contact) => contact.active).length;
  const inactiveContactCount = contacts.length - activeContactCount;
  const canDeleteFilteredContacts = filteredContacts.length > 0 && filteredContacts.every((contact) => !contact.active);

  return (
    <main className="shell">
      <div className="aceternity-beams" aria-hidden="true" />
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">AI team relay</p>
          <h1>Interchange</h1>
          <p className="hero-copy">把同一份事实，转换成每个岗位都愿意读、读得懂、能行动的团队消息。</p>
        </div>
        <div className="status-strip">
          <span className={health?.deepseekConfigured ? 'dot ok' : 'dot warn'} />
          <span>{health?.deepseekConfigured ? `DeepSeek ${health.model}` : 'DeepSeek key 未配置'}</span>
          <button className="icon-button" onClick={() => load().catch((err) => setError(err.message))} title="刷新">
            <RefreshCw size={17} />
          </button>
        </div>
      </header>

      <section className="overview-grid" aria-label="工作台概览">
        <div className="overview-card">
          <span>输入内容</span>
          <strong>{sourceText.trim().length}</strong>
          <small>字符已准备</small>
        </div>
        <div className="overview-card">
          <span>当前收件人</span>
          <strong>{selectedCount}</strong>
          <small>{activeContactCount} 位启用</small>
        </div>
        <div className="overview-card">
          <span>待确认草稿</span>
          <strong>{drafts.length}</strong>
          <small>{selectedDraftCount} 条已勾选</small>
        </div>
      </section>

      {(error || status) && (
        <section className={`notice ${error ? 'error' : ''}`}>
          {error || status}
        </section>
      )}

      <section className="workspace">
        <AceternityCard className="panel source-panel">
          <div className="panel-title">
            <FileText size={20} />
            <div>
              <h2>客观信息</h2>
              <p>先放事实，再交给 AI 转译</p>
            </div>
          </div>
          <textarea
            aria-label="客观信息输入"
            value={sourceText}
            onChange={(event) => {
              setSourceText(event.target.value);
              setMarkdownDownload(null);
              setInputRecordId(null);
            }}
            placeholder="粘贴项目变更、会议记录、缺陷说明、发布备注，或上传 Word / PDF / Excel / 截图..."
          />
          <div className="tool-row">
            <label className="file-button">
              <Upload size={17} />
              <span>上传文件</span>
              <input
                type="file"
                accept=".txt,.md,.markdown,.json,.log,.docx,.pdf,.xlsx,.xls,.xlsm,.csv,.html,.htm,.pptx,.png,.jpg,.jpeg,.webp,.bmp,.gif"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) parseTextOrFile(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            <button onClick={() => parseTextOrFile()} disabled={!sourceText.trim() || busy === 'parse'}>
              {busy === 'parse' ? <Loader2 className="spin" size={17} /> : <Check size={17} />}
              标准化文本
            </button>
            {markdownDownload && (
              <button onClick={downloadConvertedMarkdown} title="下载已转换的 Markdown 文件">
                <Download size={17} />
                <span>下载 Markdown</span>
              </button>
            )}
          </div>
        </AceternityCard>

        <AceternityCard className="panel contact-panel">
          <div className="panel-title">
            <Users size={20} />
            <div>
              <h2>收件人与角色</h2>
              <p>每个人收到适合自己岗位的版本</p>
            </div>
          </div>
          <div className="contact-toolbar">
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="搜索收件人姓名或 Webhook"
                value={contactSearch}
                placeholder="搜索姓名 / Webhook"
                onChange={(event) => setContactSearch(event.target.value)}
              />
            </label>
            <select
              aria-label="按角色筛选收件人"
              value={contactRoleFilter}
              onChange={(event) => setContactRoleFilter(event.target.value)}
            >
              <option value="all">全部角色</option>
              <option value="custom">联系人专属角色</option>
              {roles.map((role) => (
                <option key={role.key} value={role.key}>{role.label}</option>
              ))}
            </select>
            <div className="segmented-control" aria-label="按启用状态筛选收件人">
              <button
                className={contactStatusFilter === 'active' ? 'active' : ''}
                onClick={() => setContactStatusFilter('active')}
              >
                启用
              </button>
              <button
                className={contactStatusFilter === 'inactive' ? 'active' : ''}
                onClick={() => setContactStatusFilter('inactive')}
              >
                停用
              </button>
              <button
                className={contactStatusFilter === 'all' ? 'active' : ''}
                onClick={() => setContactStatusFilter('all')}
              >
                全部
              </button>
            </div>
          </div>
          <div className="contact-summary">
            <span>当前 {filteredContacts.length} 位</span>
            <span>{activeContactCount} 启用</span>
            <span>{inactiveContactCount} 停用</span>
          </div>
          <div className="bulk-actions">
            <button onClick={() => updateFilteredContacts(true)} disabled={!filteredContacts.length || busy === 'contacts-batch'}>
              <ToggleRight size={17} />
              启用当前筛选
            </button>
            <button onClick={() => updateFilteredContacts(false)} disabled={!filteredContacts.length || busy === 'contacts-batch'}>
              <ToggleLeft size={17} />
              停用当前筛选
            </button>
            <button
              className="danger-action"
              onClick={deleteFilteredContacts}
              disabled={!canDeleteFilteredContacts || busy === 'contacts-batch'}
            >
              <Trash2 size={17} />
              删除停用项
            </button>
          </div>
          <div className="contact-list">
            {filteredContacts.length === 0 ? (
              <div className="empty-state compact">当前筛选下没有收件人。</div>
            ) : filteredContacts.map((contact) => {
              const role = roleMap.get(contact.roleKey);
              const roleLabel = contact.roleMode === 'custom' ? contact.customRoleLabel : role?.label ?? '已删除角色';
              const selected = selectedContactIds.includes(contact.id);
              return (
                <div className={`contact-row ${contact.active ? '' : 'inactive'}`} key={contact.id}>
                  <input
                    aria-label={`选择 ${contact.name || '未命名联系人'}`}
                    type="checkbox"
                    checked={selected}
                    disabled={!contact.active}
                    onChange={(event) => {
                      setSelectedContactIds((current) =>
                        event.target.checked
                          ? [...current, contact.id]
                          : current.filter((id) => id !== contact.id),
                      );
                    }}
                  />
                  <input
                    aria-label="联系人姓名"
                    value={contact.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      // 输入时先更新本地状态，避免受控输入框等待异步请求返回而回退到旧值。
                      setContacts((current) =>
                        current.map((item) => (item.id === contact.id ? { ...item, name } : item)),
                      );
                    }}
                    onBlur={(event) => {
                      const name = event.currentTarget.value;
                      updateContact(contact.id, { name }).catch((err) =>
                        setError(err instanceof Error ? err.message : String(err)),
                      );
                    }}
                  />
                  <select
                    aria-label="联系人角色"
                    value={contact.roleMode === 'custom' ? 'custom' : contact.roleKey}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === 'custom') {
                        updateContact(contact.id, {
                          roleMode: 'custom',
                          roleKey: '',
                          rolePreferenceId: null,
                          customRoleLabel: contact.customRoleLabel || '联系人专属角色',
                          customRolePreference: contact.customRolePreference || '请按收件人的自定义偏好生成。',
                        }).catch((err) => setError(err.message));
                        return;
                      }
                      updateContact(contact.id, { roleMode: 'template', roleKey: value, rolePreferenceId: null }).catch((err) => setError(err.message));
                    }}
                  >
                    {roles.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    <option value="custom">联系人专属角色</option>
                  </select>
                  <select
                    aria-label="发送通道"
                    value={contact.deliveryType}
                    onChange={(event) => updateContact(contact.id, { deliveryType: event.target.value as Contact['deliveryType'] })}
                  >
                    <option value="generic_webhook">Webhook</option>
                    <option value="dingtalk_robot">钉钉机器人</option>
                  </select>
                  <input
                    aria-label="Webhook URL"
                    value={contact.webhookUrl}
                    placeholder={contact.deliveryType === 'dingtalk_robot' ? '钉钉机器人 Webhook URL' : 'Webhook URL'}
                    onChange={(event) => updateContact(contact.id, { webhookUrl: event.target.value })}
                  />
                  {contact.deliveryType === 'dingtalk_robot' && (
                    <>
                      <input
                        aria-label="钉钉加签 Secret"
                        type="password"
                        placeholder={contact.dingtalkSecretConfigured ? 'Secret 已配置，输入可覆盖' : '可选：加签 Secret'}
                        onBlur={(event) => {
                          const dingtalkSecret = event.currentTarget.value.trim();
                          if (!dingtalkSecret) return;
                          updateContact(contact.id, { dingtalkSecret }).catch((err) => setError(err.message));
                          event.currentTarget.value = '';
                        }}
                      />
                      <input
                        aria-label="钉钉安全关键词"
                        value={contact.dingtalkKeyword}
                        placeholder="可选：安全关键词"
                        onChange={(event) => updateContact(contact.id, { dingtalkKeyword: event.target.value })}
                      />
                      <button
                        className="icon-button"
                        disabled={!contact.dingtalkSecretConfigured}
                        onClick={() => updateContact(contact.id, { clearDingtalkSecret: true })}
                        title="清除钉钉 Secret"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  <button
                    className={`icon-button ${contact.active ? 'enabled' : ''}`}
                    onClick={() => updateContact(contact.id, { active: !contact.active })}
                    title={contact.active ? '停用收件人' : '启用收件人'}
                  >
                    {contact.active ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
                  </button>
                  {!contact.active && (
                    <button className="icon-button danger" onClick={() => removeContact(contact.id)} title="删除联系人">
                      <Trash2 size={16} />
                    </button>
                  )}
                  <div className="contact-role-config">
                    {contact.roleMode === 'template' ? (
                      <select
                        aria-label="联系人偏好方案"
                        value={contact.rolePreferenceId ?? ''}
                        onChange={(event) => updateContact(contact.id, {
                          rolePreferenceId: event.target.value ? Number(event.target.value) : null,
                        }).catch((err) => setError(err.message))}
                      >
                        <option value="">不使用角色偏好方案</option>
                        {role?.preferenceSets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
                      </select>
                    ) : (
                      <>
                        <input
                          aria-label="联系人专属角色名称"
                          value={contact.customRoleLabel}
                          placeholder="专属角色名称"
                          onChange={(event) => setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, customRoleLabel: event.target.value } : item))}
                          onBlur={(event) => updateContact(contact.id, { customRoleLabel: event.currentTarget.value }).catch((err) => setError(err.message))}
                        />
                        <input
                          aria-label="联系人专属角色偏好"
                          value={contact.customRolePreference}
                          placeholder="完全按这份偏好生成"
                          onChange={(event) => setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, customRolePreference: event.target.value } : item))}
                          onBlur={(event) => updateContact(contact.id, { customRolePreference: event.currentTarget.value }).catch((err) => setError(err.message))}
                        />
                      </>
                    )}
                    <input
                      aria-label="联系人补充偏好"
                      value={contact.preference}
                      placeholder="可选：联系人补充偏好"
                      onChange={(event) => setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, preference: event.target.value } : item))}
                      onBlur={(event) => updateContact(contact.id, { preference: event.currentTarget.value }).catch((err) => setError(err.message))}
                    />
                  </div>
                  <small>
                    {contact.deliveryType === 'dingtalk_robot' ? '钉钉 Markdown 发送' : '通用 Webhook 发送'}
                    {' · '}
                    {roleLabel}{contact.roleMode === 'template' && role?.defaultPreference ? ` · ${role.defaultPreference}` : ''}
                  </small>
                </div>
              );
            })}
          </div>

          <div className="new-contact">
            <input
              aria-label="新增收件人姓名"
              value={contactDraft.name}
              placeholder="新增收件人"
              onChange={(event) => setContactDraft({ ...contactDraft, name: event.target.value })}
            />
            <select
              aria-label="新增收件人角色"
              value={contactDraft.roleMode === 'custom' ? 'custom' : contactDraft.roleKey}
              onChange={(event) => {
                const value = event.target.value;
                setContactDraft(value === 'custom'
                  ? { ...contactDraft, roleMode: 'custom', roleKey: '', rolePreferenceId: null }
                  : { ...contactDraft, roleMode: 'template', roleKey: value, rolePreferenceId: null });
              }}
            >
              {roles.map((role) => (
                <option key={role.key} value={role.key}>{role.label}</option>
              ))}
              <option value="custom">联系人专属角色</option>
            </select>
            {contactDraft.roleMode === 'template' ? (
              <select
                aria-label="新增收件人偏好方案"
                value={contactDraft.rolePreferenceId ?? ''}
                onChange={(event) => setContactDraft({ ...contactDraft, rolePreferenceId: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">不使用角色偏好方案</option>
                {roleMap.get(contactDraft.roleKey)?.preferenceSets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
              </select>
            ) : (
              <>
                <input aria-label="新增收件人专属角色名称" value={contactDraft.customRoleLabel} placeholder="专属角色名称" onChange={(event) => setContactDraft({ ...contactDraft, customRoleLabel: event.target.value })} />
                <input aria-label="新增收件人专属角色偏好" value={contactDraft.customRolePreference} placeholder="完全按这份偏好生成" onChange={(event) => setContactDraft({ ...contactDraft, customRolePreference: event.target.value })} />
              </>
            )}
            <select
              aria-label="新增收件人发送通道"
              value={contactDraft.deliveryType}
              onChange={(event) =>
                setContactDraft({ ...contactDraft, deliveryType: event.target.value as Contact['deliveryType'] })
              }
            >
              <option value="generic_webhook">Webhook</option>
              <option value="dingtalk_robot">钉钉机器人</option>
            </select>
            <input
              aria-label="新增收件人 Webhook URL"
              value={contactDraft.webhookUrl}
              placeholder={contactDraft.deliveryType === 'dingtalk_robot' ? '钉钉机器人 Webhook URL' : 'Webhook URL'}
              onChange={(event) => setContactDraft({ ...contactDraft, webhookUrl: event.target.value })}
            />
            {contactDraft.deliveryType === 'dingtalk_robot' && (
              <>
                <input
                  aria-label="新增收件人钉钉加签 Secret"
                  type="password"
                  value={contactDraft.dingtalkSecret ?? ''}
                  placeholder="可选：加签 Secret"
                  onChange={(event) => setContactDraft({ ...contactDraft, dingtalkSecret: event.target.value })}
                />
                <input
                  aria-label="新增收件人钉钉安全关键词"
                  value={contactDraft.dingtalkKeyword}
                  placeholder="可选：安全关键词"
                  onChange={(event) => setContactDraft({ ...contactDraft, dingtalkKeyword: event.target.value })}
                />
              </>
            )}
            <button onClick={saveContact} disabled={busy === 'contact'}>
              <Plus size={17} />
              添加
            </button>
          </div>
        </AceternityCard>

        <AceternityCard className="panel role-panel">
          <div className="panel-title">
            <Settings2 size={20} />
            <div>
              <h2>角色与偏好</h2>
              <p>角色、关注点和偏好方案均可按需创建与复用</p>
            </div>
          </div>
          <div className="role-template-layout">
            <div className="role-template-list" aria-label="角色列表">
              {roles.map((role) => (
                <button
                  key={role.key}
                  className={currentRoleKey === role.key ? 'active' : ''}
                  onClick={() => setRoleEditKey(role.key)}
                >
                  <span>{role.label}</span>
                  <small>{`${role.usageCount} 位联系人`}</small>
                </button>
              ))}
            </div>
            <div className="role-editor">
              <div className="new-role-form">
                <input aria-label="自定义角色名称" value={newRoleLabel} placeholder="新增自定义角色名称" onChange={(event) => {
                  setNewRoleLabel(event.target.value);
                  setNewRoleRecognition(null);
                }} onBlur={() => void recognizeNewRole()} />
                <select aria-label="新增角色识别方式" value={newRoleProfileKey} onChange={(event) => {
                  setNewRoleProfileKey(event.target.value);
                  if (event.target.value !== 'custom') setNewRoleProfileDescription('');
                }}>
                  <option value="">自动识别{newRoleLabel.trim() ? `：${matchedRoleFocusPreset(newRoleLabel, roleFocusPresets)?.label ?? matchedRoleProfile(newRoleLabel, roleProfiles)?.label ?? (newRoleRecognition ? `DeepSeek：${newRoleRecognition.label}` : '失焦后识别')}` : ''}</option>
                  <option value="custom">自定义角色说明</option>
                </select>
                {newRoleProfileKey === 'custom' && <input aria-label="新增角色自定义说明" value={newRoleProfileDescription} placeholder="例如：负责向管理层汇报项目进展" onChange={(event) => setNewRoleProfileDescription(event.target.value)} />}
                <input aria-label="自定义角色默认关注点" value={newRoleDefaultPreference} placeholder="可选：默认关注点" onChange={(event) => setNewRoleDefaultPreference(event.target.value)} />
                <button onClick={generateNewRoleDefaultPreference} disabled={busy === 'role-suggestion' || !newRoleLabel.trim()}><Sparkles size={17} />AI 生成关注点</button>
                <button onClick={createRole} disabled={busy === 'role'}><Plus size={17} />新增角色</button>
              </div>
              {currentRole ? (
                <div className="role-editor-content">
                  <div className="role-editor-heading">
                    <strong>{currentRole.label}</strong>
                    <span className="role-badge">{`${currentRole.usageCount} 位联系人使用`}</span>
                  </div>
                  <>
                      <label>角色名称
                        <input value={currentRole.label} onChange={(event) => {
                          setRoleRecognitions((current) => {
                            const { [currentRole.key]: _previous, ...rest } = current;
                            return rest;
                          });
                          setRoles((items) => items.map((item) => item.key === currentRole.key ? { ...item, label: event.target.value, roleProfileKey: item.roleProfileKey === 'custom' ? 'custom' : '', roleProfileDescription: item.roleProfileKey === 'custom' ? item.roleProfileDescription : '' } : item));
                        }} onBlur={(event) => void recognizeSavedRole({ ...currentRole, label: event.currentTarget.value })} />
                      </label>
                      <label>角色识别方式
                        <select value={currentRole.roleProfileKey === 'custom' ? 'custom' : ''} onChange={(event) => setRoles((items) => items.map((item) => item.key === currentRole.key ? {
                          ...item,
                          roleProfileKey: event.target.value,
                          roleProfileDescription: event.target.value === 'custom' ? item.roleProfileDescription : '',
                        } : item))}>
                          <option value="">自动识别：{matchedRoleFocusPreset(currentRole.label, roleFocusPresets)?.label ?? matchedRoleProfile(currentRole.label, roleProfiles)?.label ?? (roleRecognitions[currentRole.key]?.source === 'deepseek' ? `DeepSeek：${roleRecognitions[currentRole.key]?.label}` : currentRole.roleProfileKey === 'deepseek' ? 'DeepSeek 已识别' : '失焦后识别')}</option>
                          <option value="custom">自定义角色说明</option>
                        </select>
                      </label>
                      {currentRole.roleProfileKey === 'custom' && <label>自定义角色说明
                        <textarea value={currentRole.roleProfileDescription} placeholder="例如：负责向管理层汇报项目进展" onChange={(event) => setRoles((items) => items.map((item) => item.key === currentRole.key ? { ...item, roleProfileDescription: event.target.value } : item))} />
                      </label>}
                      <label>默认关注点（可留空）
                        <textarea value={currentRole.defaultPreference} placeholder="留空时仅按所选偏好方案和联系人补充生成" onChange={(event) => setRoles((items) => items.map((item) => item.key === currentRole.key ? { ...item, defaultPreference: event.target.value } : item))} />
                      </label>
                      <div className="role-editor-actions">
                        <button onClick={() => generateCurrentRoleDefaultPreference(currentRole)} disabled={busy === 'role-suggestion'}><Sparkles size={17} />AI 生成关注点</button>
                        <button onClick={() => saveRole(currentRole)}><Save size={17} />保存角色</button>
                        <button className="danger-action" onClick={() => deleteRole(currentRole)} disabled={currentRole.usageCount > 0}><Trash2 size={17} />删除角色</button>
                      </div>
                  </>
                  <div className="preference-set-section">
                    <div className="preference-set-heading">
                      <strong>偏好方案</strong>
                      <span>联系人可从中单选</span>
                    </div>
                    {currentRole.preferenceSets.length === 0 ? (
                      <p className="muted-copy">还没有偏好方案。新增后可分配给多个联系人。</p>
                    ) : (
                      <div className="preference-set-list">
                        {currentRole.preferenceSets.map((set, index) => (
                          <div key={set.id} className="preference-set-item">
                            <div className="preference-set-fields">
                              <input aria-label={`${set.name} 偏好方案名称`} value={set.name} onChange={(event) => setRoles((items) => items.map((role) => role.key === currentRole.key ? { ...role, preferenceSets: role.preferenceSets.map((item) => item.id === set.id ? { ...item, name: event.target.value } : item) } : role))} />
                              <textarea aria-label={`${set.name} 偏好方案内容`} value={set.content} onChange={(event) => setRoles((items) => items.map((role) => role.key === currentRole.key ? { ...role, preferenceSets: role.preferenceSets.map((item) => item.id === set.id ? { ...item, content: event.target.value } : item) } : role))} />
                            </div>
                            <div className="preference-set-actions">
                              <button onClick={() => generatePreferenceSetContent(currentRole, set.name, set.content, (content) => setRoles((items) => items.map((role) => role.key === currentRole.key ? { ...role, preferenceSets: role.preferenceSets.map((item) => item.id === set.id ? { ...item, content } : item) } : role)))} disabled={busy === 'role-suggestion'}>AI 生成</button>
                              <button onClick={() => savePreferenceSet(set.id, set.name, set.content)}>保存</button>
                              <button disabled={index === 0} onClick={() => movePreferenceSet(currentRole, index, -1)}>上移</button>
                              <button disabled={index === currentRole.preferenceSets.length - 1} onClick={() => movePreferenceSet(currentRole, index, 1)}>下移</button>
                              <button className="icon-button danger" title="删除偏好方案" disabled={set.usageCount > 0} onClick={() => deletePreferenceSet(currentRole, set.id)}><Trash2 size={16} /></button>
                            </div>
                            <small>{set.usageCount ? `${set.usageCount} 位联系人正在使用` : '未被联系人使用'}</small>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="new-preference-set-form">
                      <input aria-label="偏好方案名称" value={preferenceSetName} placeholder="偏好方案名称，例如：简洁汇报" onChange={(event) => setPreferenceSetName(event.target.value)} />
                      {currentRoleFocusPreset?.preferenceTemplates?.length ? (
                        <select aria-label="预设偏好方案" value={preferenceTemplateKey} onChange={(event) => {
                          const template = currentRoleFocusPreset.preferenceTemplates?.find((item) => item.key === event.target.value);
                          setPreferenceTemplateKey(event.target.value);
                          if (template) {
                            setPreferenceSetName(template.name);
                            setPreferenceSetContent(template.content);
                          }
                        }}>
                          <option value="">选择预设偏好方案</option>
                          {currentRoleFocusPreset.preferenceTemplates.map((template) => (
                            <option key={template.key} value={template.key}>{template.name}</option>
                          ))}
                        </select>
                      ) : null}
                      <textarea aria-label="偏好方案内容" value={preferenceSetContent} placeholder="例如：先给结论，使用口语化表达，并明确列出风险。" onChange={(event) => setPreferenceSetContent(event.target.value)} />
                      <button onClick={() => generatePreferenceSetContent(currentRole, preferenceSetName, preferenceSetContent, setPreferenceSetContent)} disabled={busy === 'role-suggestion' || !preferenceSetName.trim()}><Sparkles size={17} />AI 生成内容</button>
                      <button onClick={() => createPreferenceSet(currentRole)}><Plus size={17} />新增偏好方案</button>
                    </div>
                  </div>
                </div>
              ) : <div className="empty-state compact">请先选择或新增一个角色。</div>}
            </div>
          </div>
        </AceternityCard>

        <AceternityCard className="panel action-panel">
          <div className="panel-title">
            <Sparkles size={20} />
            <div>
              <h2>转换与发送</h2>
              <p>先生成、再人工确认、最后发送</p>
            </div>
          </div>
          <div className="metrics">
            <strong>{sourceText.trim().length}</strong>
            <span>字符</span>
            <strong>{selectedCount}</strong>
            <span>收件人</span>
            <strong>{drafts.length}</strong>
            <span>草稿</span>
          </div>
          <button className="primary" disabled={!canGenerate} onClick={generate}>
            {busy === 'generate' ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            面向角色生成
          </button>
          <button disabled={!selectedDraftCount || busy === 'send'} onClick={sendSelected}>
            {busy === 'send' ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            确认发送 {selectedDraftCount || ''}
          </button>
        </AceternityCard>
      </section>

      <AceternityCard className="draft-board">
        <div className="board-heading">
          <Bell size={20} />
          <div>
            <h2>待确认消息</h2>
            <p>这里是最后一道温和但必要的人工把关</p>
          </div>
        </div>
        {drafts.length === 0 ? (
          <div className="empty-state">生成后，每个收件人的消息会在这里独立编辑和确认。</div>
        ) : (
          <div className="draft-grid">
            {drafts.map((draft) => (
              <AceternityCard className="draft-item" as="article" key={draft.generationRecordId}>
                <div className="draft-head">
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.selected}
                      onChange={(event) =>
                        setDrafts((current) =>
                          current.map((item) =>
                            item.generationRecordId === draft.generationRecordId
                              ? { ...item, selected: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    <span>{draft.contact.name}</span>
                  </label>
                  <div className="draft-meta">
                    <small>{draft.role.label}</small>
                    <button
                      className="copy-button"
                      onClick={() => copyDraftContent(draft)}
                      title="复制这条待确认消息的全部内容"
                      aria-label={`复制 ${draft.contact.name} 的待确认消息全部内容`}
                    >
                      {copiedDraftId === draft.generationRecordId ? <Check size={16} /> : <Copy size={16} />}
                      <span>{copiedDraftId === draft.generationRecordId ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                </div>
                <textarea
                  aria-label={`${draft.contact.name} 的待发送消息`}
                  value={draft.editedContent}
                  onChange={(event) =>
                    setDrafts((current) =>
                      current.map((item) =>
                        item.generationRecordId === draft.generationRecordId
                          ? { ...item, editedContent: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                {draft.sendStatus && <p className={draft.sendStatus.startsWith('已') ? 'sent ok-text' : 'sent'}>{draft.sendStatus}</p>}
              </AceternityCard>
            ))}
          </div>
        )}
      </AceternityCard>
    </main>
  );
}
