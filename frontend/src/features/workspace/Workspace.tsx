"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  DataTable,
  EmptyState,
  SectionTitle,
} from "@/components/ui/WorkspacePrimitives";
import NotificationList from "@/features/notifications/NotificationList";
import {
  cacheServerAccount,
  cacheServerAccounts,
  getLocalAccounts,
  LocalAccount,
} from "@/lib/local-auth";
import { apiRequest, apiUrl, notifyAuthChanged } from "@/lib/api";
import { parseStudentImportFile, StudentImportRow } from "@/lib/student-import";
import {
  BusinessData,
  BusinessNotification,
  BusinessSettings,
  DepositRequest,
  formatRupiah,
  getStudentAvailableBalance,
  getStudentBalance,
  HistoricalWasteUnit,
  maskAccountNumber,
  WasteType,
  WasteUnit,
  WalletEntry,
  WithdrawalRequest,
} from "@/lib/business-data";
import AppIcon, { AppIconName } from "@/components/ui/AppIcon";
import styles from "./Workspace.module.css";

type ManagerView = "overview" | "deposits" | "students" | "waste" | "transactions" | "withdrawals" | "reports" | "notifications";
type StudentCredential = {
  name: string;
  identifier: string;
  temporaryPassword: string;
};
type StudentView = "overview" | "deposits" | "history" | "balance" | "withdrawals" | "notifications";
type View =
  | ManagerView
  | StudentView
  | "profile"
  | "profile-details"
  | "security"
  | "preferences"
  | "settings"
  | "contact"
  | "help";

const viewNames: Record<View, string> = {
  overview: "Beranda",
  deposits: "Pengajuan setoran",
  history: "Riwayat setoran",
  students: "Peserta",
  waste: "Jenis & tarif sampah",
  transactions: "Transaksi saldo",
  withdrawals: "Pencairan saldo",
  reports: "Laporan operasional",
  balance: "Saldo saat ini",
  notifications: "Notifikasi",
  profile: "Profil",
  "profile-details": "Data akun",
  security: "Keamanan",
  preferences: "Preferensi notifikasi",
  settings: "Pengaturan",
  contact: "Kontak pengelola",
  help: "Bantuan & informasi",
};

const wasteIcons = [
  { icon: "♻️", name: "Sampah daur ulang" },
  { icon: "🥤", name: "Gelas plastik" },
  { icon: "🥫", name: "Kaleng" },
  { icon: "🍾", name: "Botol kaca" },
  { icon: "📄", name: "Kertas" },
  { icon: "📦", name: "Kardus" },
  { icon: "🔋", name: "Baterai" },
  { icon: "👕", name: "Pakaian" },
  { icon: "🍃", name: "Sampah organik" },
  { icon: "🧴", name: "Botol plastik" },
  { icon: "🛢️", name: "Minyak jelantah" },
  { icon: "💻", name: "Elektronik" },
  { icon: "🛞", name: "Ban bekas" },
  { icon: "🪵", name: "Kayu" },
  { icon: "🧱", name: "Puing bangunan" },
  { icon: "🍌", name: "Sisa makanan" },
  { icon: "💡", name: "Lampu" },
  { icon: "🫙", name: "Toples kaca" },
  { icon: "🧵", name: "Kain dan benang" },
  { icon: "💊", name: "Obat kedaluwarsa" },
];

function suggestWasteIcon(name: string) {
  const normalized = name.toLocaleLowerCase("id-ID");
  if (/jelantah|minyak goreng/.test(normalized)) return "🛢️";
  if (/elektronik|komputer|laptop|ponsel|hp|kabel/.test(normalized)) return "💻";
  if (/ban|roda/.test(normalized)) return "🛞";
  if (/kayu|serbuk kayu|mebel/.test(normalized)) return "🪵";
  if (/puing|batu bata|keramik|bangunan/.test(normalized)) return "🧱";
  if (/sisa makanan|makanan|buah|sayur/.test(normalized)) return "🍌";
  if (/lampu|bohlam/.test(normalized)) return "💡";
  if (/toples|stoples|wadah kaca/.test(normalized)) return "🫙";
  if (/kain|benang|tekstil/.test(normalized)) return "🧵";
  if (/obat|farmasi/.test(normalized)) return "💊";
  if (/botol plastik|plastik/.test(normalized)) return "🧴";
  if (/gelas|cup/.test(normalized)) return "🥤";
  if (/kaleng|aluminium|besi|logam/.test(normalized)) return "🥫";
  if (/botol kaca|kaca/.test(normalized)) return "🍾";
  if (/botol/.test(normalized)) return "🧴";
  if (/kertas|kardus|karton/.test(normalized)) return "📄";
  if (/baterai|aki|elektronik/.test(normalized)) return "🔋";
  if (/baju|pakaian/.test(normalized)) return "👕";
  if (/daun|organik/.test(normalized)) return "🍃";
  return "♻️";
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusName(status: DepositRequest["status"]) {
  return {
    pending: "Menunggu",
    approved: "Disetujui",
    rejected: "Ditolak",
    cancelled: "Dibatalkan",
  }[status];
}

function entryName(kind: "deposit" | "adjustment" | "withdrawal") {
  return {
    deposit: "Setoran",
    adjustment: "Koreksi saldo",
    withdrawal: "Pencairan tunai",
  }[kind];
}

function wasteUnitLabel(unit: HistoricalWasteUnit) {
  return unit;
}

function getMessage(error: unknown) {
  return error instanceof Error ? error.message : "Terjadi kesalahan. Silakan coba lagi.";
}

function whatsappUrl(numberValue: string, message: string) {
  const number = numberValue.replace(/\D/g, "").replace(/^0/, "62");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

async function compressPhoto(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name}: berkas harus berupa gambar.`);
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error(`${file.name}: ukuran foto maksimal 12 MB sebelum dikompres.`);
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak dapat memproses foto ini.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.72),
    );
    if (!blob) throw new Error("Foto gagal dikompres.");
    if (blob.size > 450 * 1024) throw new Error(`${file.name}: hasil foto terlalu besar.`);
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`${file.name}: foto gagal dibaca.`));
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error(`${file.name}: format foto tidak valid.`));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}

export default function Workspace({
  account,
  onAccountChange,
  onLogout,
}: {
  account: LocalAccount;
  onAccountChange: (account: LocalAccount) => void;
  onLogout: () => Promise<void>;
}) {
  const isManager = account.role === "manager";
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<BusinessData>({
    wasteTypes: [],
    deposits: [],
    walletEntries: [],
    notifications: [],
    withdrawalRequests: [],
  });
  const [students, setStudents] = useState<LocalAccount[]>([]);
  const [managerWhatsapp, setManagerWhatsapp] = useState("");
  const [settings, setSettings] = useState<BusinessSettings>({
    managerWhatsapp: "",
    inAppNotifications: true,
  });
  const [ready, setReady] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [depositFilter, setDepositFilter] = useState("pending");
  const [selectedDepositId, setSelectedDepositId] = useState("");
  const [editingType, setEditingType] = useState<WasteType | null>(null);
  const [wasteName, setWasteName] = useState("");
  const [wastePrice, setWastePrice] = useState("");
  const [wasteUnit, setWasteUnit] = useState<WasteUnit>("kg");
  const [wasteIcon, setWasteIcon] = useState("♻️");
  const [wasteImage, setWasteImage] = useState<string | null>(null);
  const [wasteVisualMode, setWasteVisualMode] = useState<"icon" | "photo">("icon");
  const [studentEditId, setStudentEditId] = useState("");
  const [studentDetailId, setStudentDetailId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [studentWhatsapp, setStudentWhatsapp] = useState("");
  const [studentActive, setStudentActive] = useState(true);
  const [importingStudents, setImportingStudents] = useState(false);
  const [importedCredentials, setImportedCredentials] = useState<StudentCredential[]>([]);
  const [resetCredential, setResetCredential] = useState<StudentCredential | null>(null);
  const [resettingStudentId, setResettingStudentId] = useState("");
  const [reviewTypes, setReviewTypes] = useState<Record<string, string>>({});
  const [reviewWeights, setReviewWeights] = useState<Record<string, string>>({});
  const [reviewNote, setReviewNote] = useState("");
  const [decisionPending, setDecisionPending] = useState(false);
  const [studentWasteIds, setStudentWasteIds] = useState<string[]>([]);
  const [unlistedWaste, setUnlistedWaste] = useState(false);
  const [unlistedWasteDescription, setUnlistedWasteDescription] = useState("");
  const [studentPhotos, setStudentPhotos] = useState<string[]>([]);
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [depositBusy, setDepositBusy] = useState(false);
  const [directStudentId, setDirectStudentId] = useState("");
  const [directWasteTypeId, setDirectWasteTypeId] = useState("");
  const [directQuantity, setDirectQuantity] = useState("");
  const [directNote, setDirectNote] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawAll, setWithdrawAll] = useState(false);
  const [withdrawalDestinationType, setWithdrawalDestinationType] = useState<"bank" | "ewallet">("bank");
  const [withdrawalInstitution, setWithdrawalInstitution] = useState("");
  const [withdrawalAccountName, setWithdrawalAccountName] = useState("");
  const [withdrawalAccountNumber, setWithdrawalAccountNumber] = useState("");
  const [editingWithdrawalId, setEditingWithdrawalId] = useState("");
  const [selectedWithdrawalId, setSelectedWithdrawalId] = useState("");
  const [withdrawalFilter, setWithdrawalFilter] = useState("active");
  const [withdrawalReviewNote, setWithdrawalReviewNote] = useState("");

  function refreshData() {
    const accounts = getLocalAccounts();
    setStudents(accounts.filter((item) => item.role === "student"));
  }

  async function refreshBusinessData() {
    const businessData = await apiRequest<
      Pick<
        BusinessData,
        "wasteTypes" | "deposits" | "walletEntries" | "withdrawalRequests" | "notifications"
      > & { preferences: BusinessSettings }
    >("/api/business/data");
    setData((current) => ({
      ...current,
      ...businessData,
      wasteTypes: businessData.wasteTypes.map((wasteType) => ({
        ...wasteType,
        image: wasteType.image?.startsWith("/api/")
          ? apiUrl(wasteType.image)
          : wasteType.image,
      })),
      deposits: businessData.deposits.map((deposit) => ({
        ...deposit,
      })),
    }));
    setSettings(businessData.preferences);
    setManagerWhatsapp(businessData.preferences.managerWhatsapp);
  }

  async function refreshServerStudents() {
    const result = await apiRequest<{ students: Omit<LocalAccount, "salt" | "passwordHash">[] }>(
      "/api/auth/students",
    );
    cacheServerAccounts(result.students);
    setStudents(getLocalAccounts().filter((item) => item.role === "student"));
  }

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      try {
        refreshData();
        void (async () => {
          try {
            await Promise.all([
              refreshBusinessData(),
              isManager ? refreshServerStudents() : Promise.resolve(),
            ]);
          } catch (loadError) {
            if (!cancelled) setError(getMessage(loadError));
          } finally {
            if (!cancelled) setReady(true);
          }
        })();
      } catch (loadError) {
        setError(getMessage(loadError));
        setReady(true);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isManager]);

  useEffect(() => {
    if (!success) return;
    const timeoutId = window.setTimeout(() => setSuccess(""), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [success]);

  async function runBusinessAction(action: () => Promise<void>, successMessage: string) {
    setError("");
    setSuccess("");
    try {
      await action();
      await refreshBusinessData();
      refreshData();
      setSuccess(successMessage);
      return true;
    } catch (actionError) {
      setError(getMessage(actionError));
      return false;
    }
  }

  async function handleLogout() {
    setError("");
    try {
      await onLogout();
    } catch (logoutError) {
      setError(getMessage(logoutError));
    }
  }

  function closeMoreMenu() {
    setMoreOpen(false);
  }

  function toggleMoreMenu() {
    if (moreOpen) {
      closeMoreMenu();
      return;
    }

    setMoreOpen(true);
  }

  const myNotifications = data.notifications
    .filter((notification) => notification.recipientId === account.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const unreadCount = myNotifications.filter((notification) => !notification.readAt).length;
  const managerNav: ManagerView[] = [
    "overview",
    "deposits",
    "students",
    "waste",
    "transactions",
    "withdrawals",
    "reports",
  ];
  const studentNav: StudentView[] = ["overview", "deposits", "balance", "withdrawals"];
  const navItems: View[] = isManager ? managerNav : studentNav;
  const mobilePrimaryNav: View[] = isManager
    ? ["overview", "deposits", "withdrawals", "profile"]
    : ["overview", "history", "withdrawals", "profile"];
  const mobileOverflowNav: View[] = [];
  const mobileNavItems: View[] = mobilePrimaryNav;
  const pendingDeposits = data.deposits.filter((item) => item.status === "pending");
  const allBalance = students.reduce(
    (total, student) => total + getStudentBalance(data, student.id),
    0,
  );
  const myBalance = getStudentBalance(data, account.id);
  const myAvailableBalance = getStudentAvailableBalance(data, account.id);
  const myDeposits = data.deposits
    .filter((deposit) => deposit.studentId === account.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const recentTransactions = [...data.walletEntries]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 6);
  const filteredStudents = students.filter((student) => {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      student.name.toLowerCase().includes(query) ||
      student.identifier.toLowerCase().includes(query) ||
      (student.className ?? "").toLowerCase().includes(query)
    );
  });
  const selectedDeposit = data.deposits.find((deposit) => deposit.id === selectedDepositId);
  const activeWasteTypes = data.wasteTypes.filter(
    (item) => item.active && item.pricePerUnit > 0,
  );

  function startEditStudent(student: LocalAccount) {
    setStudentEditId(student.id);
    setStudentName(student.name);
    setStudentClass(student.className ?? "");
    setStudentWhatsapp(student.whatsapp);
    setStudentActive(student.active !== false);
  }

  function startEditWasteType(item: WasteType) {
    if (item.unit === "buah") {
      setError("Jenis sampah lama dengan satuan PCS tidak dapat diedit atau diaktifkan kembali.");
      return;
    }
    setEditingType(item);
    setWasteName(item.name);
    setWastePrice(String(item.pricePerUnit));
    setWasteUnit(item.unit);
    setWasteIcon(item.icon ?? suggestWasteIcon(item.name));
    setWasteImage(item.image ?? null);
    setWasteVisualMode(item.image ? "photo" : "icon");
  }

  async function openDeposit(deposit: DepositRequest) {
    setSelectedDepositId(deposit.id);
    setReviewTypes(Object.fromEntries(deposit.lines.map((line, index) => [String(index), line.wasteTypeId ?? ""])));
    setReviewWeights({});
    setReviewNote("");
    setError("");
    try {
      const result = await apiRequest<{ photos: string[] }>(
        `/api/business/deposits/${encodeURIComponent(deposit.id)}/photos`,
      );
      setData((current) => ({
        ...current,
        deposits: current.deposits.map((item) =>
          item.id === deposit.id ? { ...item, photos: result.photos } : item,
        ),
      }));
    } catch (photoError) {
      setError(getMessage(photoError));
    }
  }

  function navigateTo(nextView: View) {
    setView(nextView);
    if (moreOpen) closeMoreMenu();
    else setMoreOpen(false);
    setError("");
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setSuccess("");
    try {
      const result = await apiRequest<{ account: Omit<LocalAccount, "salt" | "passwordHash"> }>(
        "/api/auth/profile",
        {
          method: "PATCH",
          body: {
            name: String(formData.get("name") ?? ""),
            className: String(formData.get("className") ?? ""),
            whatsapp: String(formData.get("whatsapp") ?? ""),
          },
        },
      );
      const updated = cacheServerAccount(result.account);
      onAccountChange(updated);
      notifyAuthChanged();
      setSuccess("Data profil berhasil diperbarui.");
    } catch (profileError) {
      setError(getMessage(profileError));
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setSuccess("");
    const formData = new FormData(form);
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmation = String(formData.get("confirmPassword") ?? "");
    if (newPassword !== confirmation) {
      setError("Konfirmasi kata sandi baru belum cocok.");
      return;
    }
    try {
      await apiRequest<{ message: string }>("/api/auth/password", {
        method: "PUT",
        body: { currentPassword, newPassword },
      });
      notifyAuthChanged();
      form.reset();
      setSuccess("Kata sandi berhasil diperbarui.");
    } catch (passwordError) {
      setError(getMessage(passwordError));
    }
  }

  async function saveManagerContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const whatsapp = String(formData.get("managerWhatsapp") ?? "");
    await runBusinessAction(async () => {
      const result = await apiRequest<{
        account: Omit<LocalAccount, "salt" | "passwordHash">;
      }>("/api/auth/profile", {
        method: "PATCH",
        body: {
          name: account.name,
          className: account.className ?? "",
          whatsapp,
        },
      });
      const updated = cacheServerAccount(result.account);
      onAccountChange(updated);
      notifyAuthChanged();
    }, "Nomor WhatsApp kontak berhasil diperbarui.");
  }

  async function toggleInAppNotifications(enabled: boolean) {
    await runBusinessAction(async () => {
      await apiRequest("/api/business/preferences", {
        method: "PATCH",
        body: { inAppNotifications: enabled },
      });
    }, enabled ? "Notifikasi dalam website diaktifkan." : "Notifikasi dalam website dinonaktifkan.");
  }

  async function submitWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      amount: withdrawAll ? getStudentAvailableBalance(data, account.id) : Number(withdrawalAmount),
      destinationType: withdrawalDestinationType,
      institution: withdrawalInstitution,
      accountName: withdrawalAccountName,
      accountNumber: withdrawalAccountNumber,
    };
    const succeeded = await runBusinessAction(async () => {
      await apiRequest(
        editingWithdrawalId
          ? `/api/business/withdrawals/${encodeURIComponent(editingWithdrawalId)}`
          : "/api/business/withdrawals",
        { method: editingWithdrawalId ? "PATCH" : "POST", body },
      );
    }, editingWithdrawalId ? "Pengajuan pencairan diperbarui." : "Pengajuan pencairan berhasil dikirim.");
    if (succeeded) {
      setEditingWithdrawalId("");
      setWithdrawalAmount("");
      setWithdrawAll(false);
    }
  }

  function editWithdrawal(request: WithdrawalRequest) {
    setEditingWithdrawalId(request.id);
    setWithdrawalAmount(String(request.amount));
    setWithdrawAll(false);
    setWithdrawalDestinationType(request.destinationType);
    setWithdrawalInstitution(request.institution);
    setWithdrawalAccountName(request.accountName);
    setWithdrawalAccountNumber(request.accountNumber);
  }

  async function cancelWithdrawal(requestId: string) {
    await runBusinessAction(async () => {
      await apiRequest(`/api/business/withdrawals/${encodeURIComponent(requestId)}/cancel`, { method: "POST" });
    }, "Pengajuan pencairan dibatalkan.");
  }

  async function reviewWithdrawal(decision: "approve" | "reject") {
    const selected = data.withdrawalRequests.find((item) => item.id === selectedWithdrawalId);
    if (!selected) return;
    await runBusinessAction(async () => {
      await apiRequest(`/api/business/withdrawals/${encodeURIComponent(selected.id)}/review`, {
        method: "POST",
        body: { decision, note: withdrawalReviewNote },
      });
    }, decision === "approve" ? "Pengajuan pencairan disetujui." : "Pengajuan pencairan ditolak.");
  }

  async function markWithdrawalPaid(requestId: string) {
    await runBusinessAction(async () => {
      await apiRequest(`/api/business/withdrawals/${encodeURIComponent(requestId)}/pay`, { method: "POST" });
    }, "Pencairan dicatat selesai.");
  }

  function renderProfileHub() {
    return (
      <section className={styles.profileGrid}>
        <div className={styles.profileCard}>
          <div className={styles.profileAvatar}>{account.name.trim().charAt(0).toUpperCase()}</div>
          <div>
            <h2>{account.name}</h2>
            <p>{isManager ? "Pengelola Bank Sampah" : `Peserta didik${account.className ? ` · ${account.className}` : ""}`}</p>
            <small>{isManager ? `Nama pengguna: ${account.identifier}` : `NISN: ${account.identifier}`}</small>
          </div>
        </div>
        <div className={styles.profileMenuCard}>
          <p className={styles.profileMenuHeading}>AKUN</p>
          <ProfileMenuItem icon="◉" title="Data akun" detail="Nama, kelas, dan nomor WhatsApp" onClick={() => navigateTo("profile-details")} />
          <ProfileMenuItem icon="♧" title="Keamanan" detail="Ubah kata sandi akun" onClick={() => navigateTo("security")} />
          <ProfileMenuItem icon="♧" title="Preferensi notifikasi" detail="Atur pemberitahuan dalam website" onClick={() => navigateTo("preferences")} />
          <p className={styles.profileMenuHeading}>LAINNYA</p>
          <ProfileMenuItem icon="⚙" title="Pengaturan" detail="Kontak pengelola dan preferensi" onClick={() => navigateTo("settings")} />
          <ProfileMenuItem icon="?" title="Bantuan & informasi" detail="Tentang aplikasi dan penyimpanan data" onClick={() => navigateTo("help")} />
          <button className={styles.profileLogout} onClick={handleLogout} type="button">
            <span aria-hidden="true">↪</span><span><strong>Keluar</strong><small>Akhiri sesi akun di browser ini</small></span><span aria-hidden="true">›</span>
          </button>
        </div>
      </section>
    );
  }

  async function approveSelectedDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDeposit) return;
    setDecisionPending(true);
    const succeeded = await runBusinessAction(async () => {
      await apiRequest("/api/business/deposits/" + encodeURIComponent(selectedDeposit.id) + "/review", {
        method: "POST",
        body: {
          decision: "approve",
          lines: selectedDeposit.lines.map((line, index) => ({
            wasteTypeId: reviewTypes[`${index}`] ?? line.wasteTypeId ?? "",
            quantity: Number(reviewWeights[`${index}`]),
          })),
          note: reviewNote,
        },
      });
    }, "Setoran disetujui dan saldo peserta bertambah.");
    setDecisionPending(false);
    if (succeeded) setSelectedDepositId("");
  }

  async function rejectSelectedDeposit() {
    if (!selectedDeposit) return;
    setDecisionPending(true);
    const succeeded = await runBusinessAction(async () => {
      await apiRequest("/api/business/deposits/" + encodeURIComponent(selectedDeposit.id) + "/review", {
        method: "POST",
        body: { decision: "reject", note: reviewNote },
      });
    }, "Setoran ditolak dan alasan sudah dikirim ke peserta.");
    setDecisionPending(false);
    if (succeeded) setSelectedDepositId("");
  }

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      const result = await apiRequest<{
        student: Omit<LocalAccount, "salt" | "passwordHash">;
      }>(`/api/auth/students/${encodeURIComponent(studentEditId)}`, {
        method: "PATCH",
        body: {
          name: studentName,
          className: studentClass,
          whatsapp: studentWhatsapp,
          active: studentActive,
        },
      });
      cacheServerAccount(result.student);
      await refreshServerStudents();
      setStudentEditId("");
      setSuccess("Data peserta berhasil diperbarui.");
    } catch (saveError) {
      setError(getMessage(saveError));
    }
  }

  async function resetStudentPassword(student: LocalAccount, temporaryPassword: string) {
    setError("");
    setSuccess("");
    setResetCredential(null);
    setResettingStudentId(student.id);
    try {
      const result = await apiRequest<{ credential: StudentCredential }>(
        `/api/auth/students/${encodeURIComponent(student.id)}/reset-password`,
        { method: "POST", body: { temporaryPassword } },
      );
      setResetCredential(result.credential);
      await refreshServerStudents();
      setSuccess("Kata sandi sementara berhasil diatur. Berikan kepada peserta secara pribadi.");
      return true;
    } catch (resetError) {
      setError(getMessage(resetError));
      return false;
    } finally {
      setResettingStudentId("");
    }
  }

  async function importStudentFile(file: File) {
    setImportingStudents(true);
    setError("");
    setSuccess("");
    try {
      const records: StudentImportRow[] = await parseStudentImportFile(file);
      const result = await apiRequest<{
        importedCount: number;
        credentials: StudentCredential[];
      }>("/api/auth/students/import", {
        method: "POST",
        body: { students: records },
      });
      setImportedCredentials((current) => [...current, ...result.credentials]);
      setSuccess(`${result.importedCount} akun siswa berhasil dibuat.`);
      await refreshServerStudents();
    } catch (importError) {
      setError(getMessage(importError));
    } finally {
      setImportingStudents(false);
    }
  }

  function changeWasteName(name: string) {
    setWasteName(name);
    setWasteIcon(suggestWasteIcon(name));
  }

  async function saveWaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (wasteVisualMode === "photo" && !wasteImage) {
      setError("Pilih foto sampah atau gunakan tampilan ikon.");
      return;
    }
    const image = wasteVisualMode === "photo" ? wasteImage : null;
    const payload = {
      name: wasteName,
      pricePerUnit: Number(wastePrice),
      unit: wasteUnit,
      icon: wasteIcon,
      image,
      active: editingType?.active ?? true,
    };
    const succeeded = await runBusinessAction(async () => {
      await apiRequest(
        editingType
          ? `/api/business/waste-types/${encodeURIComponent(editingType.id)}`
          : "/api/business/waste-types",
        { method: editingType ? "PATCH" : "POST", body: payload },
      );
    }, editingType ? "Jenis dan tarif sampah diperbarui." : "Jenis sampah berhasil ditambahkan.");
    if (succeeded) {
      setEditingType(null);
      setWasteName("");
      setWastePrice("");
      setWasteUnit("kg");
      setWasteIcon("♻️");
      setWasteImage(null);
      setWasteVisualMode("icon");
    }
  }

  async function selectWasteImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      setWasteImage(await compressPhoto(file));
      setError("");
    } catch (imageError) {
      setError(getMessage(imageError));
    }
  }

  async function toggleWaste(item: WasteType) {
    await runBusinessAction(
      async () => {
        await apiRequest(`/api/business/waste-types/${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          body: {
          name: item.name,
          pricePerUnit: item.pricePerUnit,
          unit: item.unit,
          active: !item.active,
          icon: item.icon ?? suggestWasteIcon(item.name),
          image: item.image ?? null,
          },
        });
      },
      item.active ? "Jenis sampah dinonaktifkan." : "Jenis sampah diaktifkan.",
    );
  }

  function selectWasteType(id: string) {
    setStudentWasteIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    if (studentPhotos.length + files.length > 5) {
      setError("Maksimal 5 foto untuk satu pengajuan.");
      return;
    }
    try {
      const compressed = await Promise.all(files.map(compressPhoto));
      const newPhotos = [...studentPhotos, ...compressed];
      if (newPhotos.reduce((sum, photo) => sum + photo.length, 0) > 1_600_000) {
        setError("Total ukuran foto terlalu besar untuk dikirim. Kurangi jumlah atau ukuran foto.");
        return;
      }
      setStudentPhotos(newPhotos);
      setPhotoNames((current) => [...current, ...files.map((file) => file.name)]);
    } catch (photoError) {
      setError(getMessage(photoError));
    }
  }

  async function submitStudentDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDepositBusy(true);
    await runBusinessAction(async () => {
      await apiRequest("/api/business/deposits", {
        method: "POST",
        body: {
          wasteTypeIds: unlistedWaste ? [] : studentWasteIds,
          otherWasteDescription: unlistedWaste ? unlistedWasteDescription : undefined,
          photos: studentPhotos.map((dataUrl, index) => ({
            dataUrl,
            name: photoNames[index] ?? `foto-${index + 1}.jpg`,
          })),
        },
      });
      setStudentWasteIds([]);
      setUnlistedWaste(false);
      setUnlistedWasteDescription("");
      setStudentPhotos([]);
      setPhotoNames([]);
    }, "Pengajuan setoran berhasil dikirim kepada pengelola.");
    setDepositBusy(false);
  }

  async function submitDirectDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDepositBusy(true);
    await runBusinessAction(async () => {
      await apiRequest("/api/business/deposits/direct", {
        method: "POST",
        body: {
          studentId: directStudentId,
          wasteTypeId: directWasteTypeId,
          quantity: directQuantity,
          note: directNote,
        },
      });
      setDirectStudentId("");
      setDirectWasteTypeId("");
      setDirectQuantity("");
      setDirectNote("");
    }, "Setoran berhasil dicatat dan saldo siswa diperbarui.");
    setDepositBusy(false);
  }

  if (!ready) {
    return <main className={styles.loading}>Memuat data dari server…</main>;
  }

  return (
    <main className={styles.appShell}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="Bank Sampah Sekolah Merdeka">
          <span className={styles.brandMark} aria-hidden="true">
            <Image alt="" height={39} src="/icon.svg" width={39} />
          </span>
          <span><strong>Bank Sampah</strong><small>Sekolah Merdeka</small></span>
        </Link>
        <div className={styles.accountArea}>
          <button
            aria-current={view === "notifications" ? "page" : undefined}
            aria-label={unreadCount > 0 ? `Notifikasi, ${unreadCount} belum dibaca` : "Notifikasi"}
            className={`${styles.notificationTrigger} ${view === "notifications" ? styles.notificationTriggerActive : ""}`}
            onClick={() => navigateTo("notifications")}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
            {unreadCount > 0 && <span className={styles.notificationBadge}>{unreadCount}</span>}
          </button>
          <button
            aria-current={view === "profile" ? "page" : undefined}
            className={`${styles.profileTrigger} ${view === "profile" ? styles.profileTriggerActive : ""}`}
            onClick={() => navigateTo("profile")}
            type="button"
          >
            <span className={styles.profileTriggerAvatar}>{account.name.trim().charAt(0).toUpperCase()}</span>
            <span className={styles.accountName}>{account.name}</span>
          </button>
          <span className={styles.roleBadge}>{isManager ? "Pengelola" : "Peserta didik"}</span>
        </div>
      </header>

      <div className={styles.layout}>
        <nav className={styles.sidebar} aria-label="Navigasi utama">
          <p className={styles.navLabel}>MENU</p>
          {navItems.map((item) => (
            <button
              aria-label={viewNames[item]}
              aria-current={view === item ? "page" : undefined}
              className={`${styles.navButton} ${view === item ? styles.navActive : ""}`}
              key={item}
              onClick={() => navigateTo(item)}
              type="button"
            >
              <span aria-hidden="true">{navIcon(item)}</span>
              {viewNames[item]}
            </button>
          ))}
          <div className={styles.sidebarNote}>
            <span>Data tersimpan aman</span>
            <p>Data akun dan aktivitas tersimpan di server dan dapat diakses antar perangkat.</p>
          </div>
        </nav>

        <section className={`${styles.mainContent} ${styles.viewTransition}`} key={view}>
          {view !== "overview" && <div className={styles.pageHeading}>
            <div>
              {["profile-details", "security", "preferences", "settings", "contact", "help"].includes(view) && (
                <button className={styles.backButton} onClick={() => navigateTo(view === "contact" ? "settings" : "profile")} type="button">
                  ← Kembali {view === "contact" ? "ke Pengaturan" : "ke Profil"}
                </button>
              )}
              <p className={styles.eyebrow}>
                {eyebrowFor(view, isManager)}
              </p>
              <h1>{headingFor(view, account.name)}</h1>
              <p>{descriptionFor(view, isManager)}</p>
            </div>
          </div>}

          {(error || success) && (
            <p className={`${styles.feedback} ${error ? styles.feedbackError : styles.feedbackSuccess}`} role={error ? "alert" : "status"}>
              {error || success}
            </p>
          )}

          {view === "reports" && isManager && (
            <ManagerReports data={data} students={students} />
          )}

          {view === "overview" && (
            isManager ? (
              <ManagerOverview
                balance={allBalance}
                deposits={data.deposits}
                managerName={account.name}
                onNavigate={setView}
                pendingCount={pendingDeposits.length}
                pendingWithdrawalCount={data.withdrawalRequests.filter((item) => item.status === "pending").length}
                students={students}
                transactions={recentTransactions}
                wasteTypes={data.wasteTypes}
              />
            ) : (
              <StudentOverview
                account={account}
                balance={myAvailableBalance}
                deposits={myDeposits}
                onNavigate={setView}
              />
            )
          )}
          {view === "deposits" && (
            isManager ? (
              <ManagerDeposits
                data={data}
                filter={depositFilter}
                onFilter={setDepositFilter}
                onOpen={openDeposit}
                onCancel={() => setSelectedDepositId("")}
                selected={selectedDeposit}
                onApprove={approveSelectedDeposit}
                onReject={rejectSelectedDeposit}
                onReviewType={(key, id) => setReviewTypes((current) => ({ ...current, [key]: id }))}
                onReviewWeight={(key, weight) => setReviewWeights((current) => ({ ...current, [key]: weight }))}
                onReviewNote={setReviewNote}
                reviewNote={reviewNote}
                reviewTypes={reviewTypes}
                reviewWeights={reviewWeights}
                students={students}
                busy={decisionPending}
                directStudentId={directStudentId}
                directWasteTypeId={directWasteTypeId}
                directQuantity={directQuantity}
                directNote={directNote}
                onDirectStudent={setDirectStudentId}
                onDirectWasteType={setDirectWasteTypeId}
                onDirectQuantity={setDirectQuantity}
                onDirectNote={setDirectNote}
                onDirectSubmit={submitDirectDeposit}
                directBusy={depositBusy}
              />
            ) : (
              <StudentDeposits
                activeWasteTypes={activeWasteTypes}
                busy={depositBusy}
                deposits={myDeposits}
                onCancelDeposit={(depositId) =>
                  runBusinessAction(async () => {
                    await apiRequest(`/api/business/deposits/${encodeURIComponent(depositId)}/cancel`, {
                      method: "POST",
                    });
                  }, "Pengajuan setoran dibatalkan.")
                }
                onPhotoChange={handlePhotoChange}
                onSelectWaste={selectWasteType}
                onUnlistedWasteChange={setUnlistedWaste}
                onUnlistedWasteDescriptionChange={setUnlistedWasteDescription}
                onSubmit={submitStudentDeposit}
                photoNames={photoNames}
                photos={studentPhotos}
                selectedIds={studentWasteIds}
                unlistedWaste={unlistedWaste}
                unlistedWasteDescription={unlistedWasteDescription}
              />
            )
          )}
          {view === "students" && isManager && (
            <ManagerStudents
              filteredStudents={filteredStudents}
              search={search}
              onSearch={setSearch}
              onEdit={startEditStudent}
              onShowDetails={(student) =>
                setStudentDetailId((current) => current === student.id ? "" : student.id)
              }
              balanceFor={(studentId) => getStudentBalance(data, studentId)}
              data={data}
              detailStudent={students.find((student) => student.id === studentDetailId) ?? null}
              availableBalanceFor={(studentId) => getStudentAvailableBalance(data, studentId)}
              reservedBalanceFor={(studentId) => getStudentBalance(data, studentId) - getStudentAvailableBalance(data, studentId)}
              onCloseDetails={() => setStudentDetailId("")}
              editingId={studentEditId}
              name={studentName}
              className={studentClass}
              whatsapp={studentWhatsapp}
              active={studentActive}
              onName={setStudentName}
              onClass={setStudentClass}
              onWhatsapp={setStudentWhatsapp}
              onActive={setStudentActive}
              onSave={saveStudent}
              onCancel={() => setStudentEditId("")}
              importing={importingStudents}
              importedCredentials={importedCredentials}
              onImport={(file) => void importStudentFile(file)}
              onResetPassword={resetStudentPassword}
              resetCredential={resetCredential}
              resettingStudentId={resettingStudentId}
              onClearResetCredential={() => setResetCredential(null)}
              onClearCredentials={() => setImportedCredentials([])}
            />
          )}
          {view === "waste" && isManager && (
            <ManagerWasteTypes
              items={data.wasteTypes}
              editing={editingType}
              name={wasteName}
              price={wastePrice}
              unit={wasteUnit}
              onName={changeWasteName}
              onPrice={setWastePrice}
              onUnit={setWasteUnit}
              onEdit={startEditWasteType}
              icon={wasteIcon}
              image={wasteImage}
              visualMode={wasteVisualMode}
              onIcon={setWasteIcon}
              onImageChange={selectWasteImage}
              onRemoveImage={() => setWasteImage(null)}
              onVisualMode={setWasteVisualMode}
              onToggle={toggleWaste}
              onSave={saveWaste}
              onCancel={() => {
                setEditingType(null);
                setWasteName("");
                setWastePrice("");
                setWasteUnit("kg");
                setWasteIcon("♻️");
                setWasteImage(null);
                setWasteVisualMode("icon");
              }}
            />
          )}
          {view === "transactions" && isManager && (
            <section className={styles.card}>
              <SectionTitle title="Riwayat transaksi saldo" />
              {recentTransactions.length === 0 ? (
                <EmptyState title="Belum ada transaksi saldo" detail="Transaksi setoran yang disetujui akan tampil di sini." />
              ) : (
                <TransactionRows entries={data.walletEntries} students={students} />
              )}
            </section>
          )}
          {view === "withdrawals" && (
            isManager ? (
              <ManagerWithdrawals
                requests={data.withdrawalRequests
                  .filter((request) => withdrawalFilter === "all" ||
                    (withdrawalFilter === "active"
                      ? request.status === "pending" || request.status === "processing"
                      : request.status === withdrawalFilter))
                  .sort((left, right) => right.createdAt.localeCompare(left.createdAt))}
                students={students}
                filter={withdrawalFilter}
                onFilter={setWithdrawalFilter}
                selected={data.withdrawalRequests.find((request) => request.id === selectedWithdrawalId)}
                onOpen={(request) => {
                  setSelectedWithdrawalId(request.id);
                  setWithdrawalReviewNote(request.note);
                }}
                onClose={() => setSelectedWithdrawalId("")}
                note={withdrawalReviewNote}
                onNote={setWithdrawalReviewNote}
                onApprove={() => void reviewWithdrawal("approve")}
                onReject={() => void reviewWithdrawal("reject")}
                onMarkPaid={(requestId) => void markWithdrawalPaid(requestId)}
              />
            ) : (
              <StudentWithdrawals
                requests={data.withdrawalRequests.filter((request) => request.studentId === account.id)}
                available={myAvailableBalance}
                reserved={getStudentBalance(data, account.id) - myAvailableBalance}
                maxAmount={
                  myAvailableBalance +
                  (data.withdrawalRequests.find((request) => request.id === editingWithdrawalId)?.amount ?? 0)
                }
                editingId={editingWithdrawalId}
                amount={withdrawalAmount}
                withdrawAll={withdrawAll}
                destinationType={withdrawalDestinationType}
                institution={withdrawalInstitution}
                accountName={withdrawalAccountName}
                accountNumber={withdrawalAccountNumber}
                onAmount={setWithdrawalAmount}
                onWithdrawAll={setWithdrawAll}
                onDestinationType={setWithdrawalDestinationType}
                onInstitution={setWithdrawalInstitution}
                onAccountName={setWithdrawalAccountName}
                onAccountNumber={setWithdrawalAccountNumber}
                onSubmit={submitWithdrawal}
                onEdit={editWithdrawal}
                onCancel={(requestId) => void cancelWithdrawal(requestId)}
                onReset={() => {
                  setEditingWithdrawalId("");
                  setWithdrawalAmount("");
                  setWithdrawAll(false);
                  setWithdrawalDestinationType("bank");
                  setWithdrawalInstitution("");
                  setWithdrawalAccountName("");
                  setWithdrawalAccountNumber("");
                }}
              />
            )
          )}
          {view === "balance" && !isManager && (
            <StudentBalance
              total={myBalance}
              available={myAvailableBalance}
            />
          )}
          {view === "history" && !isManager && (
            <StudentHistory deposits={myDeposits} />
          )}
          {view === "notifications" && (
            <NotificationList
              items={myNotifications}
              onReadAll={() =>
                runBusinessAction(async () => {
                  await apiRequest("/api/business/notifications/read-all", { method: "PATCH" });
                }, "Semua notifikasi ditandai sudah dibaca.")
              }
              onRead={(notification: BusinessNotification) =>
                runBusinessAction(async () => {
                  await apiRequest(`/api/business/notifications/${encodeURIComponent(notification.id)}/read`, {
                    method: "PATCH",
                  });
                }, "Notifikasi ditandai sudah dibaca.")
              }
            />
          )}
          {view === "profile" && renderProfileHub()}
          {view === "profile-details" && (
            <ProfileDetails
              account={account}
              onSave={updateProfile}
            />
          )}
          {view === "security" && <SecuritySettings onSave={updatePassword} />}
          {view === "preferences" && (
            <NotificationPreferences
              enabled={settings.inAppNotifications}
              onChange={toggleInAppNotifications}
            />
          )}
          {view === "settings" && (
            <SettingsOptions
              manager={isManager}
              notificationsEnabled={settings.inAppNotifications}
              onContact={() => navigateTo("contact")}
              onHelp={() => navigateTo("help")}
              onPreferences={() => navigateTo("preferences")}
            />
          )}
          {view === "contact" && (
            <ManagerContactSettings
              manager={isManager}
              whatsapp={managerWhatsapp}
              onSave={saveManagerContact}
              onHelp={() => navigateTo("help")}
            />
          )}
          {view === "help" && (
            <BusinessDataHelp
              manager={isManager}
              whatsapp={managerWhatsapp}
              onContactSettings={() => navigateTo("contact")}
            />
          )}
        </section>
      </div>
      {moreOpen && (
        <div className={styles.mobileMoreLayer}>
          <button
            aria-label="Tutup menu lainnya"
            className={styles.mobileMoreScrim}
            onClick={closeMoreMenu}
            type="button"
          />
          <div
            aria-label="Menu lainnya"
            className={`${styles.mobileMorePanel} ${styles.mobileMoreGridPanel}`}
            role="menu"
          >
            {mobileOverflowNav.map((item) => {
              const itemStyle = item === "deposits"
                ? styles.moreItemDeposit
                : item === "students"
                  ? styles.moreItemStudents
                : item === "waste"
                  ? styles.moreItemWaste
                  : item === "transactions"
                    ? styles.moreItemTransaction
                    : item === "withdrawals"
                      ? styles.moreItemWithdrawal
                      : styles.moreItemBalance;
              return (
                <button
                  aria-label={viewNames[item]}
                  aria-current={view === item ? "page" : undefined}
                  className={`${styles.moreItem} ${itemStyle} ${
                    !isManager ? styles.moreItemStudent : ""
                  } ${styles.moreItemGrid} ${view === item ? styles.moreItemActive : ""}`}
                  key={item}
                  onClick={() => navigateTo(item)}
                  role="menuitem"
                  type="button"
                >
                  <span className={styles.moreItemLabel}>{mobileMenuLabel(item)}</span>
                  <span aria-hidden="true" className={styles.moreItemIcon}>{navIcon(item)}</span>
                  {item === "deposits" && pendingDeposits.length > 0 && (
                    <span className={styles.moreUnread}>{pendingDeposits.length} menunggu</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <nav className={styles.mobileNav} aria-label="Navigasi bawah">
        {mobileNavItems.map((item) => (
          <button
            aria-current={view === item ? "page" : undefined}
            className={`${styles.mobileNavItem} ${view === item ? styles.mobileNavActive : ""}`}
            key={item}
            onClick={() => {
              closeMoreMenu();
              navigateTo(item);
            }}
            type="button"
          >
            <span className={styles.mobileNavIcon} aria-hidden="true">{navIcon(item)}</span>
            <span className={styles.mobileNavLabel}>{mobileViewName(item, isManager)}</span>
            {item === "deposits" && pendingDeposits.length > 0 && (
              <span className={styles.mobileNavBadge} aria-label={`${pendingDeposits.length} menunggu`}>
                {pendingDeposits.length}
              </span>
            )}
          </button>
        ))}
        {mobileOverflowNav.length > 0 && (
          <button
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-label={moreOpen ? "Tutup menu" : "Buka menu"}
            className={`${styles.mobileNavItem} ${
              moreOpen || mobileOverflowNav.includes(view) ? styles.mobileNavActive : ""
            } ${moreOpen ? styles.mobileNavMoreOpen : ""}`}
            onClick={toggleMoreMenu}
            type="button"
          >
            <span className={styles.mobileNavIcon} aria-hidden="true">{moreOpen ? "×" : "•••"}</span>
            <span className={styles.mobileNavLabel}>{moreOpen ? "Tutup" : "Menu"}</span>
          </button>
        )}
      </nav>
      <footer className={styles.footer}>© Sekolah Merdeka · Bank Sampah</footer>
    </main>
  );
}

function navIcon(item: View) {
  const iconMap: Record<View, AppIconName> = {
    overview: "home",
    deposits: "deposit",
    history: "transactions",
    students: "students",
    waste: "waste",
    transactions: "transactions",
    balance: "balance",
    withdrawals: "withdrawal",
    reports: "report",
    notifications: "notification",
    profile: "profile",
    "profile-details": "profile",
    security: "settings",
    preferences: "notification",
    settings: "settings",
    contact: "contact",
    help: "help",
  };
  const icon = iconMap[item];
  return <AppIcon name={icon} />;
}

function mobileViewName(item: View, manager: boolean) {
  if (item === "deposits") return manager ? "Setoran" : "Riwayat";
  if (item === "history") return "Riwayat";
  if (item === "balance") return "Saldo";
  if (item === "withdrawals") return "Tarik saldo";
  return item === "profile" ? "Profil" : viewNames[item];
}

function mobileMenuLabel(item: View) {
  if (item === "deposits") return "Setoran";
  if (item === "waste") return "Tarif rupiah";
  if (item === "transactions") return "Transaksi saldo";
  if (item === "withdrawals") return "Pencairan saldo";
  if (item === "balance") return "Saldo saat ini";
  return viewNames[item];
}

function headingFor(view: View, name: string) {
  if (view === "overview") return `Halo, ${name.split(" ")[0]}.`;
  return viewNames[view];
}

function eyebrowFor(view: View, manager: boolean) {
  if (view === "overview") return manager ? "RUANG PENGELOLA" : "RUANG PESERTA";
  if (view === "profile" || ["profile-details", "security", "preferences", "settings", "contact", "help"].includes(view)) {
    return "PROFIL & PREFERENSI";
  }
  return manager ? "OPERASIONAL BANK SAMPAH" : "AKTIVITAS BANK SAMPAH";
}

function descriptionFor(view: View, manager: boolean) {
  if (view === "overview") {
    return manager
      ? "Kelola setoran, tarif rupiah, peserta, dan transaksi saldo."
      : "Ajukan setoran, kumpulkan saldo rupiah, dan ajukan pencairan.";
  }
  const descriptions: Partial<Record<View, string>> = {
    deposits: manager
      ? "Periksa foto setoran, catat berat hasil timbangan, lalu proses pengajuan."
      : "Pilih jenis sampah dan unggah foto untuk mengajukan setoran.",
    students: "Cari peserta, perbarui informasi, atau nonaktifkan akun.",
    waste: "Atur tarif rupiah per satuan untuk setiap jenis sampah.",
    transactions: "Lihat riwayat transaksi saldo peserta.",
    withdrawals: manager
      ? "Tinjau pengajuan pencairan saldo dan tandai transfer yang selesai."
      : "Ajukan pencairan saldo rupiah ke rekening bank atau e-wallet.",
    reports: "Pantau rekap setoran, saldo, dan pencairan berdasarkan periode.",
    balance: "Lihat saldo rupiah dan saldo yang tersedia.",
    notifications: "Pemberitahuan aktivitas terkait akunmu.",
    profile: "Kelola akun dan preferensi aplikasi.",
    "profile-details": "Perbarui informasi akun yang tersimpan di server.",
    security: "Ganti kata sandi akunmu.",
    preferences: "Atur pemberitahuan aktivitas di dalam website.",
    settings: "Atur kontak pengelola dan preferensi notifikasi.",
    contact: "Atur kontak WhatsApp untuk komunikasi dengan peserta.",
    help: "Informasi tentang penggunaan aplikasi dan penyimpanan data.",
  };
  return descriptions[view] ?? "";
}

function ManagerOverview({
  balance,
  deposits,
  managerName,
  onNavigate,
  pendingCount,
  pendingWithdrawalCount,
  students,
  transactions,
  wasteTypes,
}: {
  balance: number;
  deposits: DepositRequest[];
  managerName: string;
  onNavigate: (view: View) => void;
  pendingCount: number;
  pendingWithdrawalCount: number;
  students: LocalAccount[];
  transactions: WalletEntry[];
  wasteTypes: WasteType[];
}) {
  const activeCount = students.filter((student) => student.active !== false).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDeposits = deposits.filter(
    (deposit) => deposit.status === "approved" && new Date(deposit.reviewedAt ?? deposit.createdAt) >= today,
  );
  const todayWeight = todayDeposits
    .flatMap((deposit) => deposit.lines)
    .reduce((total, line) => total + (line.unit === "kg" ? (line.quantity ?? 0) : 0), 0);
  const todayValue = todayDeposits
    .flatMap((deposit) => deposit.lines)
    .reduce((total, line) => total + (line.amount ?? 0), 0);
  return (
    <>
      <section className={styles.managerWelcome}>
        <div className={styles.managerAvatar}>{managerName.trim().charAt(0).toUpperCase()}</div>
        <div>
          <p>RUANG PENGELOLA</p>
          <h2>Halo, {managerName.split(" ")[0]}! 👋</h2>
          <span>Pengelola Bank Sampah · Aktivitas operasional hari ini</span>
        </div>
      </section>
      <div className={styles.statGrid}>
        <Stat label="Setoran hari ini" value={String(todayDeposits.length)} hint="Transaksi disetujui" icon="↗" />
        <Stat label="Berat diterima" value={`${todayWeight.toLocaleString("id-ID", { maximumFractionDigits: 3 })} kg`} hint="Hasil penimbangan hari ini" icon="kg" />
        <Stat label="Nilai setoran" value={formatRupiah(todayValue)} hint="Total nilai hari ini" icon="Rp" />
        <Stat label="Menunggu penarikan" value={String(pendingWithdrawalCount)} hint={`${activeCount} siswa aktif · saldo ${formatRupiah(balance)}`} icon="⇄" />
      </div>
      <div className={styles.twoColumns}>
        <section className={styles.card}>
          <SectionTitle title="Perlu diperiksa" action="Lihat semua" onAction={() => onNavigate("deposits")} />
          {pendingCount === 0 ? (
            <EmptyState title="Belum ada pengajuan" detail="Pengajuan setoran baru akan terlihat di sini." />
          ) : (
            <p className={styles.inlineSummary}>{pendingCount} pengajuan menunggu pemeriksaan.</p>
          )}
        </section>
        <section className={styles.card}>
          <SectionTitle title="Transaksi saldo terbaru" action="Lihat transaksi" onAction={() => onNavigate("transactions")} />
          {transactions.length === 0 ? (
            <EmptyState title="Belum ada transaksi saldo" detail="Saldo dari setoran yang disetujui akan tampil di sini." />
          ) : (
            <PointActivityRows entries={transactions} students={students} />
          )}
        </section>
      </div>
      <div className={styles.quickActions}>
        <button onClick={() => onNavigate("deposits")} type="button">Input setoran <span>→</span></button>
        <button onClick={() => onNavigate("students")} type="button">Data siswa <span>→</span></button>
        <button onClick={() => onNavigate("withdrawals")} type="button">Penarikan <span>→</span></button>
        <button onClick={() => onNavigate("reports")} type="button">Laporan <span>→</span></button>
      </div>
      <button className={styles.inlineNavigationButton} onClick={() => onNavigate("waste")} type="button">
        Atur jenis dan tarif sampah <span>→</span>
      </button>
      {!wasteTypes.some((item) => item.active && item.pricePerUnit > 0) && (
        <p className={styles.helperBanner}>Tambahkan jenis sampah dan tarif rupiah agar setoran bisa dinilai.</p>
      )}
    </>
  );
}

function PointActivityRows({
  entries,
  students,
}: {
  entries: WalletEntry[];
  students: LocalAccount[];
}) {
  const studentMap = new Map(students.map((student) => [student.id, student]));
  return (
    <div className={styles.depositList}>
      {entries.map((entry) => (
        <article className={styles.depositRow} key={entry.id}>
          <div>
            <strong>{studentMap.get(entry.studentId)?.name ?? "Peserta tidak ditemukan"}</strong>
            <small>{entry.description} · {dateTime(entry.createdAt)}</small>
          </div>
          <b className={entry.amount > 0 ? styles.amountPositive : styles.amountNegative}>
            {entry.amount > 0 ? "+" : "−"}{formatRupiah(Math.abs(entry.amount))}
          </b>
        </article>
      ))}
    </div>
  );
}

function Stat({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: string }) {
  return (
    <article className={styles.statCard}>
      <span className={styles.statIcon}>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function ManagerReports({ data, students }: { data: BusinessData; students: LocalAccount[] }) {
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const now = new Date();
  const start = new Date(now);
  if (period === "today") start.setHours(0, 0, 0, 0);
  if (period === "week") start.setDate(now.getDate() - 6);
  if (period === "month") start.setDate(1);
  const deposits = data.deposits.filter((deposit) =>
    deposit.status === "approved" && new Date(deposit.createdAt) >= start,
  );
  const depositIds = new Set(deposits.map((deposit) => deposit.id));
  const lines = deposits.flatMap((deposit) => deposit.lines);
  const weight = lines.reduce((total, line) => total + (line.unit === "kg" ? (line.quantity ?? 0) : 0), 0);
  const value = lines.reduce((total, line) => total + (line.amount ?? 0), 0);
  const withdrawals = data.withdrawalRequests.filter((request) =>
    request.status === "paid" && new Date(request.updatedAt) >= start,
  );
  const latest = data.walletEntries.filter((entry) =>
    entry.kind === "deposit" && (!entry.depositId || depositIds.has(entry.depositId)),
  ).slice(0, 10);
  const byType = new Map<string, { weight: number; value: number }>();
  for (const line of lines) {
    const current = byType.get(line.wasteTypeName) ?? { weight: 0, value: 0 };
    current.weight += line.quantity ?? 0;
    current.value += line.amount ?? 0;
    byType.set(line.wasteTypeName, current);
  }
  return (
    <>
      <section className={styles.card}>
        <div className={styles.toolbar}>
          <label className={styles.filterLabel}>Periode
            <select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}>
              <option value="today">Hari ini</option><option value="week">Minggu ini</option><option value="month">Bulan ini</option>
            </select>
          </label>
          <span className={styles.resultCount}>{students.length} siswa terdaftar</span>
        </div>
        <div className={styles.statGrid}>
          <Stat label="Total berat" value={`${weight.toLocaleString("id-ID", { maximumFractionDigits: 3 })} kg`} hint="Sampah diterima" icon="kg" />
          <Stat label="Nilai setoran" value={formatRupiah(value)} hint={`${deposits.length} transaksi disetujui`} icon="Rp" />
          <Stat label="Total pencairan" value={formatRupiah(withdrawals.reduce((sum, item) => sum + item.amount, 0))} hint={`${withdrawals.length} pencairan selesai`} icon="↓" />
        </div>
      </section>
      <section className={styles.twoColumns}>
        <section className={styles.card}><SectionTitle title="Rekap jenis sampah" />
          {byType.size === 0 ? <EmptyState title="Belum ada data" detail="Setoran yang disetujui akan masuk ke rekap." /> : (
            <div className={styles.depositList}>{Array.from(byType.entries()).sort((a, b) => b[1].weight - a[1].weight).map(([name, item]) => (
              <article className={styles.depositRow} key={name}><div><strong>{name}</strong><small>{item.weight.toLocaleString("id-ID", { maximumFractionDigits: 3 })} kg</small></div><b>{formatRupiah(item.value)}</b></article>
            ))}</div>
          )}
        </section>
        <section className={styles.card}><SectionTitle title="Setoran terbaru" />
          {latest.length === 0 ? <EmptyState title="Belum ada transaksi" detail="Transaksi akan tampil setelah setoran dicatat." /> : <PointActivityRows entries={latest} students={students} />}
        </section>
      </section>
    </>
  );
}

function ManagerDeposits({
  data,
  filter,
  onFilter,
  onOpen,
  selected,
  onCancel,
  onApprove,
  onReject,
  onReviewType,
  onReviewWeight,
  onReviewNote,
  reviewNote,
  reviewTypes,
  reviewWeights,
  students,
  busy,
  directStudentId,
  directWasteTypeId,
  directQuantity,
  directNote,
  onDirectStudent,
  onDirectWasteType,
  onDirectQuantity,
  onDirectNote,
  onDirectSubmit,
  directBusy,
}: {
  data: BusinessData;
  filter: string;
  onFilter: (filter: string) => void;
  onOpen: (deposit: DepositRequest) => void;
  onCancel: () => void;
  onApprove: (event: FormEvent<HTMLFormElement>) => void;
  onReject: () => void;
  onReviewType: (key: string, id: string) => void;
  onReviewWeight: (key: string, weight: string) => void;
  onReviewNote: (note: string) => void;
  reviewNote: string;
  reviewTypes: Record<string, string>;
  reviewWeights: Record<string, string>;
  students: LocalAccount[];
  selected?: DepositRequest;
  busy: boolean;
  directStudentId: string;
  directWasteTypeId: string;
  directQuantity: string;
  directNote: string;
  onDirectStudent: (value: string) => void;
  onDirectWasteType: (value: string) => void;
  onDirectQuantity: (value: string) => void;
  onDirectNote: (value: string) => void;
  onDirectSubmit: (event: FormEvent<HTMLFormElement>) => void;
  directBusy: boolean;
}) {
  const [filterByStudent, setFilterByStudent] = useState("");
  const [searchText, setSearchText] = useState("");
  const [filterByType, setFilterByType] = useState("");
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const deposits = data.deposits
    .filter((deposit) => filter === "all" || deposit.status === filter)
    .filter((deposit) => !filterByStudent || deposit.studentId === filterByStudent)
    .filter((deposit) =>
      !searchText.trim() ||
      studentMap.get(deposit.studentId)?.name.toLocaleLowerCase().includes(searchText.trim().toLocaleLowerCase()) ||
      deposit.lines.some((line) => line.wasteTypeName.toLocaleLowerCase().includes(searchText.trim().toLocaleLowerCase())),
    )
    .filter((deposit) => !filterByType || deposit.lines.some((line) => line.wasteTypeId === filterByType))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const activeTypes = data.wasteTypes.filter(
    (item) => item.active && item.pricePerUnit > 0,
  );
  const approvedTotal =
    selected?.status === "approved" && selected.lines.some((line) => line.amount !== undefined)
      ? selected.lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
      : null;
  const selectedType = activeTypes.find((item) => item.id === directWasteTypeId);
  const directAmount = selectedType && Number(directQuantity) > 0
    ? Math.round(Number(directQuantity) * selectedType.pricePerUnit)
    : 0;

  return (
    <>
      <section className={styles.cardForm}>
        <div className={styles.sectionTitle}>
          <div><h2>Input setoran hasil timbang</h2><p>Berat dicatat langsung oleh petugas setelah penimbangan.</p></div>
        </div>
        <form className={styles.formGrid} onSubmit={onDirectSubmit}>
          <label className={styles.field}>Siswa
            <select required value={directStudentId} onChange={(event) => onDirectStudent(event.target.value)}>
              <option value="">Pilih siswa</option>
              {students.filter((student) => student.active !== false).map((student) => (
                <option key={student.id} value={student.id}>{student.name} · {student.identifier}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>Jenis sampah
            <select required value={directWasteTypeId} onChange={(event) => onDirectWasteType(event.target.value)}>
              <option value="">Pilih jenis</option>
              {activeTypes.filter((item) => item.unit === "kg").map((item) => (
                <option key={item.id} value={item.id}>{item.name} · {formatRupiah(item.pricePerUnit)}/kg</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>Berat (kg)
            <input required min="0.001" max="100000" step="0.001" inputMode="decimal" type="number" value={directQuantity} onChange={(event) => onDirectQuantity(event.target.value)} />
          </label>
          <div className={styles.depositCalculation}>
            <span>Harga per kg <strong>{selectedType ? formatRupiah(selectedType.pricePerUnit) : "—"}</strong></span>
            <span>Total setoran <strong>{directAmount > 0 ? formatRupiah(directAmount) : "—"}</strong></span>
          </div>
          <label className={styles.field}>Catatan (opsional)
            <input maxLength={500} value={directNote} onChange={(event) => onDirectNote(event.target.value)} placeholder="Contoh: setoran pagi" />
          </label>
          <button className={styles.primaryButton} disabled={directBusy || activeTypes.length === 0} type="submit">
            {directBusy ? "Menyimpan…" : "Simpan setoran"}
          </button>
        </form>
      </section>
      <section className={styles.card}>
        <div className={styles.toolbar}>
          <label className={styles.searchField}>
            Cari setoran
            <input onChange={(event) => setSearchText(event.target.value)} placeholder="Nama siswa atau jenis sampah" value={searchText} />
          </label>
          <label className={styles.filterLabel}>
            Status
            <select onChange={(event) => onFilter(event.target.value)} value={filter}>
              <option value="pending">Menunggu pemeriksaan</option>
              <option value="approved">Disetujui</option>
              <option value="rejected">Ditolak</option>
              <option value="cancelled">Dibatalkan</option>
              <option value="all">Semua pengajuan</option>
            </select>
          </label>
          <label className={styles.filterLabel}>
            Jenis sampah
            <select onChange={(event) => setFilterByType(event.target.value)} value={filterByType}>
              <option value="">Semua jenis</option>
              {data.wasteTypes.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className={styles.filterLabel}>
            Peserta
            <select onChange={(event) => setFilterByStudent(event.target.value)} value={filterByStudent}>
              <option value="">Semua peserta</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>{student.name} · {student.identifier}</option>
              ))}
            </select>
          </label>
          <span className={styles.resultCount}>{deposits.length} pengajuan</span>
        </div>
        {deposits.length === 0 ? (
          <EmptyState title="Tidak ada pengajuan" detail="Pengajuan yang sesuai filter akan muncul di sini." />
        ) : (
          <DataTable headers={["Peserta", "Tanggal", "Jenis sampah", "Foto", "Status", "Aksi"]}>
            {deposits.map((deposit) => (
              <tr key={deposit.id}>
                <td>
                  <strong>{studentMap.get(deposit.studentId)?.name ?? "Peserta tidak ditemukan"}</strong>
                  <small>{studentMap.get(deposit.studentId)?.identifier ?? ""}</small>
                </td>
                <td>{dateTime(deposit.createdAt)}</td>
                <td>{deposit.lines.map((line) => line.wasteTypeName).join(", ")}</td>
                <td>{deposit.photoCount ?? deposit.photos.length} foto</td>
                <td><StatusBadge status={deposit.status} /></td>
                <td><button className={styles.smallButton} onClick={() => onOpen(deposit)} type="button">Detail</button></td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      {selected && (
        <section className={styles.card}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>Detail pemeriksaan</h2>
              <p>{studentMap.get(selected.studentId)?.name ?? "Peserta"} · {dateTime(selected.createdAt)}</p>
            </div>
            <button className={styles.textButton} onClick={onCancel} type="button">Tutup</button>
          </div>
          <div className={styles.photoGrid}>
            {selected.photos.map((photo, index) => (
              <a href={photo} key={`${selected.id}-photo-${index}`} rel="noreferrer" target="_blank">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={`Foto setoran ${index + 1}`} src={photo} />
              </a>
            ))}
          </div>
          {selected.status === "pending" ? (
            <form className={styles.reviewForm} onSubmit={onApprove}>
              <h3>Konfirmasi jumlah/berat sampah</h3>
              {selected.lines.map((line, index) => {
                const key = String(index);
                const selectedTypeId = reviewTypes[key] ?? line.wasteTypeId ?? "";
                const selectedType = data.wasteTypes.find((item) => item.id === selectedTypeId);
                const quantity = Number(reviewWeights[key] ?? "");
                const unit = selectedType?.unit ?? line.unit;
                const unitLabel = wasteUnitLabel(unit);
                const estimate =
                  selectedType && quantity > 0
                    ? formatRupiah(Math.round(quantity * selectedType.pricePerUnit))
                    : selectedType && selectedType.pricePerUnit <= 0
                      ? "Tarif rupiah belum diatur"
                      : "Isi jumlah untuk menghitung nominal";
                return (
                  <div className={styles.reviewLine} key={`${line.wasteTypeId}-${index}`}>
                    <label>
                      Jenis sampah
                      <select
                        onChange={(event) => onReviewType(key, event.target.value)}
                        required
                        value={selectedTypeId}
                      >
                        {!selectedTypeId && <option value="">Pilih jenis sampah</option>}
                        {data.wasteTypes.map((type) => (
                          <option disabled={!type.active || type.pricePerUnit <= 0} key={type.id} value={type.id}>
                            {type.name}{!type.active ? " (nonaktif)" : type.pricePerUnit <= 0 ? " (atur tarif rupiah)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {`Berat/volume aktual (${unitLabel})`}
                      <input
                        min="0.01"
                        onChange={(event) => onReviewWeight(key, event.target.value)}
                        required
                        step="0.01"
                        type="number"
                        value={reviewWeights[key] ?? ""}
                      />
                    </label>
                    <span className={styles.estimate}>{estimate}</span>
                  </div>
                );
              })}
              <label className={styles.field}>
                Catatan pengelola (opsional)
                <textarea onChange={(event) => onReviewNote(event.target.value)} value={reviewNote} />
              </label>
              <div className={styles.buttonRow}>
                <button className={styles.primaryButton} disabled={busy || activeTypes.length === 0} type="submit">
                  Setujui & tambahkan saldo
                </button>
                <button className={styles.dangerButton} disabled={busy} onClick={onReject} type="button">
                  Tolak pengajuan
                </button>
              </div>
              {activeTypes.length === 0 && <p className={styles.formHint}>Aktifkan minimal satu jenis sampah sebelum menyetujui setoran.</p>}
            </form>
          ) : (
            <div className={styles.reviewSummary}>
              <StatusBadge status={selected.status} />
              {selected.lines.map((line, index) => (
                <p key={`${line.wasteTypeId}-${index}`}>
                  {line.wasteTypeName}: {line.quantity ?? "—"} {wasteUnitLabel(line.unit)}
                  {line.amount !== null && line.amount !== undefined ? ` = ${formatRupiah(line.amount)}` : ""}
                </p>
              ))}
              {approvedTotal !== null && <strong>Total: {formatRupiah(approvedTotal)}</strong>}
              {selected.note && <p>Catatan: {selected.note}</p>}
            </div>
          )}
        </section>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: DepositRequest["status"] }) {
  const className = {
    pending: styles.statusPending,
    approved: styles.statusApproved,
    rejected: styles.statusRejected,
    cancelled: styles.statusMuted,
  }[status];
  return <span className={`${styles.status} ${className}`}>{statusName(status)}</span>;
}

function ManagerStudents({
  filteredStudents,
  search,
  onSearch,
  onEdit,
  onShowDetails,
  balanceFor,
  data,
  detailStudent,
  availableBalanceFor,
  reservedBalanceFor,
  onCloseDetails,
  editingId,
  name,
  className,
  whatsapp,
  active,
  onName,
  onClass,
  onWhatsapp,
  onActive,
  onSave,
  onCancel,
  importing,
  importedCredentials,
  resetCredential,
  resettingStudentId,
  onImport,
  onResetPassword,
  onClearResetCredential,
  onClearCredentials,
}: {
  filteredStudents: LocalAccount[];
  search: string;
  onSearch: (value: string) => void;
  onEdit: (student: LocalAccount) => void;
  onShowDetails: (student: LocalAccount) => void;
  balanceFor: (studentId: string) => number;
  data: BusinessData;
  detailStudent: LocalAccount | null;
  availableBalanceFor: (studentId: string) => number;
  reservedBalanceFor: (studentId: string) => number;
  onCloseDetails: () => void;
  editingId: string;
  name: string;
  className: string;
  whatsapp: string;
  active: boolean;
  onName: (value: string) => void;
  onClass: (value: string) => void;
  onWhatsapp: (value: string) => void;
  onActive: (value: boolean) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  importing: boolean;
  importedCredentials: StudentCredential[];
  resetCredential: StudentCredential | null;
  resettingStudentId: string;
  onImport: (file: File) => void;
  onResetPassword: (student: LocalAccount, temporaryPassword: string) => Promise<boolean>;
  onClearResetCredential: () => void;
  onClearCredentials: () => void;
}) {
  const [resetStudent, setResetStudent] = useState<LocalAccount | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState("");

  async function submitResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetStudent) return;
    if (temporaryPassword !== confirmTemporaryPassword) {
      setResetPasswordError("Konfirmasi kata sandi belum cocok.");
      return;
    }
    setResetPasswordError("");
    const succeeded = await onResetPassword(resetStudent, temporaryPassword);
    if (succeeded) {
      setResetStudent(null);
      setTemporaryPassword("");
      setConfirmTemporaryPassword("");
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.studentImport}>
        <div>
          <h2>Impor data siswa</h2>
          <p>Unggah CSV atau Excel (.xlsx) dengan kolom NISN dan Nama; Kelas opsional. Format NISN sebagai teks agar angka nol di awal tetap tersimpan.</p>
          <button
            className={styles.textButton}
            onClick={() => downloadCsv("template-data-siswa.csv", [["NISN", "Nama", "Kelas"]])}
            type="button"
          >
            Unduh template CSV
          </button>
        </div>
        <label className={styles.field}>
          Pilih file siswa
          <input
            accept=".csv,.xlsx"
            disabled={importing}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onImport(file);
            }}
            type="file"
          />
        </label>
        {importing && <p role="status">Memvalidasi dan mengimpor data siswa…</p>}
      </div>
      {resetStudent && (
        <form className={styles.resetPasswordForm} onSubmit={submitResetPassword}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>Atur kata sandi sementara</h2>
              <p>Untuk {resetStudent.name} · NISN {resetStudent.identifier}</p>
            </div>
            <button
              className={styles.textButton}
              disabled={resettingStudentId === resetStudent.id}
              onClick={() => {
                setResetStudent(null);
                setTemporaryPassword("");
                setConfirmTemporaryPassword("");
                setResetPasswordError("");
              }}
              type="button"
            >
              Batal
            </button>
          </div>
          <p>
            Buat kata sandi sementara minimal 8 karakter dan sampaikan secara pribadi. Sesi aktif siswa akan dikeluarkan, lalu siswa wajib mengganti kata sandi saat masuk.
          </p>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Kata sandi sementara
              <input
                autoComplete="new-password"
                disabled={resettingStudentId === resetStudent.id}
                maxLength={128}
                minLength={8}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                required
                type="password"
                value={temporaryPassword}
              />
            </label>
            <label className={styles.field}>
              Ulangi kata sandi sementara
              <input
                autoComplete="new-password"
                disabled={resettingStudentId === resetStudent.id}
                maxLength={128}
                minLength={8}
                onChange={(event) => setConfirmTemporaryPassword(event.target.value)}
                required
                type="password"
                value={confirmTemporaryPassword}
              />
            </label>
          </div>
          {resetPasswordError && <p className={styles.formError} role="alert">{resetPasswordError}</p>}
          <div className={styles.buttonRow}>
            <button className={styles.primaryButton} disabled={resettingStudentId === resetStudent.id} type="submit">
              {resettingStudentId === resetStudent.id ? "Menyimpan…" : "Atur kata sandi"}
            </button>
          </div>
        </form>
      )}
      {importedCredentials.length > 0 && (
        <div className={styles.studentImportResult}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>Akun siswa berhasil dibuat</h2>
              <p>Simpan kata sandi sementara sekarang. Kata sandi ini hanya ditampilkan setelah impor.</p>
            </div>
            <button className={styles.textButton} onClick={onClearCredentials} type="button">Tutup</button>
          </div>
          <DataTable headers={["Nama", "NISN", "Kata sandi sementara"]}>
            {importedCredentials.map((credential) => (
              <tr key={credential.identifier}>
                <td>{credential.name}</td>
                <td>{credential.identifier}</td>
                <td><code>{credential.temporaryPassword}</code></td>
              </tr>
            ))}
          </DataTable>
          <button
            className={styles.primaryButton}
            onClick={() => downloadCsv(
              "kredensial-siswa-sementara.csv",
              [
                ["Nama", "NISN", "Kata sandi sementara"],
                ...importedCredentials.map((item) => [item.name, item.identifier, item.temporaryPassword]),
              ],
            )}
            type="button"
          >
            Unduh daftar kredensial
          </button>
        </div>
      )}
      {resetCredential && (
        <div className={styles.studentImportResult}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>Kata sandi sementara peserta</h2>
              <p>Berikan kata sandi ini secara pribadi. Hanya ditampilkan sekarang; peserta wajib menggantinya setelah masuk.</p>
            </div>
            <button className={styles.textButton} onClick={onClearResetCredential} type="button">Tutup</button>
          </div>
          <DataTable headers={["Nama", "NISN", "Kata sandi sementara"]}>
            <tr>
              <td>{resetCredential.name}</td>
              <td>{resetCredential.identifier}</td>
              <td><code>{resetCredential.temporaryPassword}</code></td>
            </tr>
          </DataTable>
        </div>
      )}
      <div className={styles.toolbar}>
        <label className={styles.searchField}>
          Cari peserta
          <input onChange={(event) => onSearch(event.target.value)} placeholder="Nama, NISN, atau kelas" value={search} />
        </label>
        <span className={styles.resultCount}>{filteredStudents.length} peserta</span>
      </div>
      {filteredStudents.length === 0 ? (
        <EmptyState title="Belum ada peserta" detail="Impor data siswa dari file untuk membuat akun peserta." />
      ) : (
        <DataTable headers={["Nama", "NISN", "Kelas", "Saldo saat ini", "WhatsApp", "Status", "Aksi"]}>
          {filteredStudents.map((student) => (
            <tr key={student.id}>
              <td><strong>{student.name}</strong></td>
              <td>{student.identifier}</td>
              <td>{student.className || "—"}</td>
              <td>{formatRupiah(balanceFor(student.id))}</td>
              <td>
                {student.whatsapp ? (
                  <a className={styles.tableLink} href={whatsappUrl(student.whatsapp, `Halo ${student.name}, saya pengelola Bank Sampah Sekolah Merdeka.`)} rel="noreferrer" target="_blank">WhatsApp</a>
                ) : "—"}
              </td>
              <td><span className={`${styles.status} ${student.active === false ? styles.statusRejected : styles.statusApproved}`}>{student.active === false ? "Nonaktif" : "Aktif"}</span></td>
              <td>
                <div className={`${styles.tableActions} ${styles.studentActions}`}>
                  <button className={styles.smallButton} onClick={() => onShowDetails(student)} type="button">Detail</button>
                  <button className={styles.smallButton} onClick={() => onEdit(student)} type="button">Kelola</button>
                  <button
                    className={styles.smallButton}
                    disabled={Boolean(resettingStudentId)}
                    onClick={() => {
                      setResetStudent(student);
                      setTemporaryPassword("");
                      setConfirmTemporaryPassword("");
                      setResetPasswordError("");
                      onClearResetCredential();
                    }}
                    type="button"
                  >
                    {resetStudent?.id === student.id ? "Sedang dipilih" : "Reset sandi"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {detailStudent && (
        <StudentDetail
          student={detailStudent}
          data={data}
          balance={balanceFor(detailStudent.id)}
          available={availableBalanceFor(detailStudent.id)}
          reserved={reservedBalanceFor(detailStudent.id)}
          onClose={onCloseDetails}
        />
      )}
      {editingId && (
        <form className={styles.inlineForm} onSubmit={onSave}>
          <div className={styles.sectionTitle}><h2>Edit data peserta</h2><button className={styles.textButton} onClick={onCancel} type="button">Tutup</button></div>
          <div className={styles.formGrid}>
            <label className={styles.field}>Nama lengkap<input onChange={(event) => onName(event.target.value)} required value={name} /></label>
            <label className={styles.field}>Kelas (opsional)<input onChange={(event) => onClass(event.target.value)} value={className} /></label>
            <label className={styles.field}>Nomor WhatsApp<input onChange={(event) => onWhatsapp(event.target.value)} required type="tel" value={whatsapp} /></label>
            <label className={styles.checkField}><input checked={active} onChange={(event) => onActive(event.target.checked)} type="checkbox" /> Akun peserta aktif</label>
          </div>
          <div className={styles.buttonRow}><button className={styles.primaryButton} type="submit">Simpan perubahan</button><button className={styles.secondaryButton} onClick={onCancel} type="button">Batal</button></div>
        </form>
      )}
    </section>
  );
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((value) => {
      const safeValue = /^[\u0000-\u0020]*[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${safeValue.replace(/"/g, '""')}"`;
    }).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function StudentDetail({
  student,
  data,
  balance,
  available,
  reserved,
  onClose,
}: {
  student: LocalAccount;
  data: BusinessData;
  balance: number;
  available: number;
  reserved: number;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"deposits" | "transactions" | "withdrawals">("deposits");
  const deposits = data.deposits
    .filter((deposit) => deposit.studentId === student.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const entries = data.walletEntries
    .filter((entry) => entry.studentId === student.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const withdrawals = data.withdrawalRequests
    .filter((request) => request.studentId === student.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const approvedDepositAmount = deposits
    .filter((deposit) => deposit.status === "approved")
    .reduce(
      (total, deposit) =>
        total + deposit.lines.reduce((lineTotal, line) => lineTotal + (line.amount ?? 0), 0),
      0,
    );
  const approvedQuantityByUnit = deposits
    .filter((deposit) => deposit.status === "approved")
    .flatMap((deposit) => deposit.lines)
    .reduce<Partial<Record<WasteUnit | "buah", number>>>((totals, line) => {
      totals[line.unit] = (totals[line.unit] ?? 0) + (line.quantity ?? 0);
      return totals;
    }, {});
  const approvedQuantitySummary = (["kg", "liter", "buah"] as const)
    .filter((unit) => approvedQuantityByUnit[unit])
    .map((unit) => `${(approvedQuantityByUnit[unit] ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })} ${unit}`)
    .join(" · ") || "0";
  return (
    <section className={styles.studentDetail}>
      <div className={styles.sectionTitle}>
        <div>
          <h2>Detail peserta</h2>
          <p>Informasi akun dan seluruh aktivitas peserta.</p>
        </div>
        <button className={styles.textButton} onClick={onClose} type="button">Tutup detail</button>
      </div>
      <div className={styles.studentProfile}>
        <div className={styles.studentProfileHeading}>
          <div className={styles.studentAvatar} aria-hidden="true">
            {student.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
          </div>
          <div>
            <h3>{student.name}</h3>
            <span>{student.active === false ? "Akun nonaktif" : "Akun aktif"}</span>
          </div>
          <span className={`${styles.status} ${student.active === false ? styles.statusMuted : styles.statusApproved}`}>
            {student.active === false ? "Nonaktif" : "Aktif"}
          </span>
        </div>
        <div className={styles.studentProfileInfo}>
          <div><span>NISN</span><strong>{student.identifier}</strong></div>
          <div><span>Kelas</span><strong>{student.className || "Belum diisi"}</strong></div>
          <div>
            <span>WhatsApp</span>
            {student.whatsapp
              ? <a href={whatsappUrl(student.whatsapp, `Halo ${student.name}, saya pengelola Bank Sampah Sekolah Merdeka.`)} rel="noreferrer" target="_blank">{student.whatsapp}</a>
              : <strong>Belum diisi</strong>}
          </div>
          <div><span>Bergabung sejak</span><strong>{dateTime(student.createdAt)}</strong></div>
        </div>
      </div>
      <div className={styles.studentDetailStats}>
        <div><span>Saldo berjalan</span><strong>{formatRupiah(balance)}</strong></div>
        <div><span>Saldo tersedia</span><strong>{formatRupiah(available)}</strong></div>
        <div><span>Saldo ditahan</span><strong>{formatRupiah(reserved)}</strong></div>
        <div><span>Saldo dari setoran</span><strong>{formatRupiah(approvedDepositAmount)}</strong></div>
        <div><span>Setoran disetujui</span><strong>{deposits.filter((deposit) => deposit.status === "approved").length} pengajuan</strong></div>
        <div><span>Total jumlah disetujui</span><strong>{approvedQuantitySummary}</strong></div>
        <div><span>Pencairan selesai</span><strong>{withdrawals.filter((request) => request.status === "paid").length}</strong></div>
        <div><span>Pengajuan menunggu</span><strong>{deposits.filter((deposit) => deposit.status === "pending").length + withdrawals.filter((request) => request.status === "pending").length} pengajuan</strong></div>
      </div>
      <div className={styles.studentHistory}>
        <div className={styles.studentHistoryTabs} role="tablist" aria-label="Riwayat aktivitas peserta">
          {([
            ["deposits", `Setoran (${deposits.length})`],
            ["transactions", `Transaksi saldo (${entries.length})`],
            ["withdrawals", `Pencairan (${withdrawals.length})`],
          ] as const).map(([tab, label]) => (
            <button
              aria-selected={activeTab === tab}
              className={activeTab === tab ? styles.studentHistoryTabActive : ""}
              id={`student-history-tab-${tab}`}
              key={tab}
              onClick={() => setActiveTab(tab)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div
          aria-labelledby={`student-history-tab-${activeTab}`}
          className={styles.studentHistoryPanel}
          role="tabpanel"
        >
          {activeTab === "deposits" && (deposits.length === 0
            ? <small>Belum ada pengajuan setoran.</small>
            : deposits.map((deposit) => (
              <article className={styles.studentActivityRow} key={deposit.id}>
                <div>
                  <strong>{deposit.lines.map((line) => line.wasteTypeName).join(", ") || "Setoran"}</strong>
                  <small>{dateTime(deposit.createdAt)} · {deposit.photoCount ?? deposit.photos.length} foto</small>
                  {deposit.lines.map((line, index) => (
                    <small key={`${deposit.id}-${line.wasteTypeId}-${index}`}>
                      {line.wasteTypeName}: {line.quantity === null ? "Jumlah belum dicatat" : `${line.quantity} ${wasteUnitLabel(line.unit)}`}
                      {line.amount !== null && line.amount !== undefined ? ` · ${formatRupiah(line.amount)}` : ""}
                    </small>
                  ))}
                  {deposit.note && <small>Catatan: {deposit.note}</small>}
                </div>
                <div className={styles.studentActivityMeta}>
                  <span className={`${styles.status} ${deposit.status === "approved" ? styles.statusApproved : deposit.status === "rejected" ? styles.statusRejected : deposit.status === "pending" ? styles.statusPending : styles.statusMuted}`}>{statusName(deposit.status)}</span>
                  {deposit.lines.some((line) => line.amount !== undefined) && (
                    <b>{formatRupiah(deposit.lines.reduce((total, line) => total + (line.amount ?? 0), 0))}</b>
                  )}
                </div>
              </article>
            )))}
          {activeTab === "transactions" && (entries.length === 0
            ? <small>Belum ada transaksi saldo.</small>
            : entries.map((entry) => (
              <article className={styles.studentActivityRow} key={entry.id}>
                <div><strong>{entry.description}</strong><small>{dateTime(entry.createdAt)}</small></div>
                <b className={entry.amount >= 0 ? styles.amountPositive : styles.amountNegative}>{entry.amount >= 0 ? "+" : "−"}{formatRupiah(Math.abs(entry.amount))}</b>
              </article>
            )))}
          {activeTab === "withdrawals" && (withdrawals.length === 0
            ? <small>Belum ada pengajuan pencairan.</small>
            : withdrawals.map((request) => (
              <article className={styles.studentActivityRow} key={request.id}>
                <div>
                  <strong>{formatRupiah(request.amount)} · {request.institution}</strong>
                  <small>Diajukan {dateTime(request.createdAt)} · {maskAccountNumber(request.accountNumber)}</small>
                  {request.note && <small>Catatan pengelola: {request.note}</small>}
                </div>
                <WithdrawalStatus status={request.status} />
              </article>
            )))}
        </div>
      </div>
    </section>
  );
}

function ManagerWasteTypes({
  items,
  editing,
  name,
  price,
  unit,
  icon,
  image,
  visualMode,
  onName,
  onPrice,
  onUnit,
  onIcon,
  onImageChange,
  onRemoveImage,
  onVisualMode,
  onEdit,
  onToggle,
  onSave,
  onCancel,
}: {
  items: WasteType[];
  editing: WasteType | null;
  name: string;
  price: string;
  unit: WasteUnit;
  icon: string;
  image: string | null;
  visualMode: "icon" | "photo";
  onName: (value: string) => void;
  onPrice: (value: string) => void;
  onUnit: (value: WasteUnit) => void;
  onIcon: (icon: string) => void;
  onImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  onVisualMode: (mode: "icon" | "photo") => void;
  onEdit: (item: WasteType) => void;
  onToggle: (item: WasteType) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const form = (
    <form className={`${styles.cardForm} ${editing ? styles.editWasteForm : ""}`} onSubmit={onSave}>
      <h2>{editing ? "Ubah jenis sampah" : "Tambah jenis sampah"}</h2>
      <p>Nominal saldo dihitung dari tarif per satuan dikalikan berat/jumlah yang disetujui.</p>
      <label className={styles.field}>
        Nama jenis sampah (boleh custom)
        <input
          maxLength={80}
          onChange={(event) => onName(event.target.value)}
          placeholder="Contoh: Minyak jelantah atau limbah elektronik"
          required
          value={name}
        />
        <small className={styles.fieldHint}>
          Tulis nama jenis sampah sendiri. Pilih satuan, tarif rupiah, lalu ikon atau foto untuk katalog peserta.
        </small>
      </label>
      <label className={styles.field}>Satuan penimbangan/penghitungan
        <select onChange={(event) => onUnit(event.target.value as WasteUnit)} value={unit}>
          <option value="kg">Kilogram (kg)</option>
          <option value="liter">Liter (L)</option>
        </select>
      </label>
      <label className={styles.field}>
        Tarif per {wasteUnitLabel(unit)} (Rp)
        <input min="1" onChange={(event) => onPrice(event.target.value)} placeholder="Contoh: 1000" required step="1" type="number" value={price} />
        <small className={styles.rateConversion}>Nominal setoran disimpan sebagai saldo rupiah setelah disetujui.</small>
      </label>
      <fieldset className={styles.visualPicker}>
        <legend>Tampilan jenis sampah</legend>
        <div className={styles.visualModeButtons}>
          <button className={visualMode === "icon" ? styles.visualModeActive : ""} onClick={() => onVisualMode("icon")} type="button">Pakai ikon</button>
          <button className={visualMode === "photo" ? styles.visualModeActive : ""} onClick={() => onVisualMode("photo")} type="button">Pakai foto</button>
        </div>
        {visualMode === "icon" ? (
          <div className={styles.wasteIconChoices} aria-label="Pilih ikon">
            {wasteIcons.map((option) => (
              <button
                aria-label={`Pilih ${option.name}`}
                aria-pressed={icon === option.icon}
                className={icon === option.icon ? styles.wasteIconSelected : ""}
                key={option.icon}
                onClick={() => onIcon(option.icon)}
                title={option.name}
                type="button"
              >
                <WasteIcon icon={option.icon} />
                <small>{option.name}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.wasteImagePicker}>
            {image ? (
              <div className={styles.wasteImagePreview}>
                <Image alt="Pratinjau foto sampah" height={68} src={image} unoptimized width={84} />
                <button className={styles.textButton} onClick={onRemoveImage} type="button">Hapus foto</button>
              </div>
            ) : (
              <label className={styles.field}>Unggah foto sampah
                <input accept="image/*" onChange={onImageChange} type="file" />
              </label>
            )}
            <small>Foto dikompres otomatis sebelum dikirim dan disimpan di server.</small>
          </div>
        )}
        <div className={styles.wasteVisualPreview}>
          <WasteVisual item={{ icon, image: visualMode === "photo" ? image : null }} />
          <span>Pratinjau katalog peserta</span>
        </div>
      </fieldset>
      <div className={styles.buttonRow}>
        <button className={styles.primaryButton} type="submit">{editing ? "Simpan perubahan" : "Tambah jenis sampah"}</button>
        {editing && <button className={styles.secondaryButton} onClick={onCancel} type="button">Batal</button>}
      </div>
    </form>
  );

  if (editing) {
    return (
      <div className={styles.editWasteWorkspace}>
        <button className={styles.backButton} onClick={onCancel} type="button">← Kembali ke daftar jenis sampah</button>
        {form}
      </div>
    );
  }

  return (
    <div className={styles.twoColumns}>
      <section className={styles.card}>
        <SectionTitle title="Daftar jenis sampah" />
        {items.length === 0 ? (
          <EmptyState title="Belum ada jenis sampah" detail="Tambahkan jenis sampah dan tarif rupiah di formulir." />
        ) : (
          <DataTable headers={["Jenis", "Tarif / satuan", "Status", "Aksi"]}>
            {items.map((item) => (
              <tr key={item.id}>
                <td><div className={styles.wasteTableName}><WasteVisual item={item} /><strong>{item.name}</strong></div></td>
                <td>
                  <div className={styles.wasteRate}>
                    <strong>{formatRupiah(item.pricePerUnit)} / {wasteUnitLabel(item.unit)}</strong>
                  </div>
                </td>
                <td><span className={`${styles.status} ${item.active ? styles.statusApproved : styles.statusMuted}`}>{item.active ? "Aktif" : "Nonaktif"}</span></td>
                <td>
                  {item.unit === "buah" ? (
                    <small className={styles.rateConversion}>PCS lama · tidak dapat diaktifkan</small>
                  ) : (
                    <div className={styles.tableActions}><button className={styles.smallButton} onClick={() => onEdit(item)} type="button">Edit</button><button className={styles.textButton} onClick={() => onToggle(item)} type="button">{item.active ? "Nonaktifkan" : "Aktifkan"}</button></div>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
      {form}
    </div>
  );
}

function WasteVisual({ item }: { item: Pick<WasteType, "icon" | "image"> & Partial<Pick<WasteType, "name">> }) {
  if (item.image) {
    return <span className={styles.wasteVisual}><Image alt="" crossOrigin="use-credentials" height={36} src={item.image} unoptimized width={36} /></span>;
  }
  return (
    <span className={styles.wasteVisual} aria-hidden="true">
      <WasteIcon icon={item.icon ?? (item.name ? suggestWasteIcon(item.name) : "♻️")} />
    </span>
  );
}

function WasteIcon({ icon }: { icon: string }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.wasteSvg}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 32 32"
    >
      {icon === "♻️" ? (
        <>
          <path d="m12.1 6.1 2.2-3.8 3.2 5.5-2.2 3.8-1.2-2.1H9.8" />
          <path d="M9.8 9.5 7 14.3l-4.4-.1 3.2-5.5A4.6 4.6 0 0 1 9.8 6h2.8" />
          <path d="m24.1 12.3 4.4.1-3.2 5.5a4.6 4.6 0 0 1-4 2.3h-2.7" />
          <path d="m22.2 16.4 2.8-4.8-3.2-5.5-4.4.1" />
          <path d="m13 22.1-2.2 3.8-3.2-5.5 2.2-3.8 1.2 2.1h4.3" />
          <path d="M17.6 18.7H23l2.2 3.8-6.4.1a4.6 4.6 0 0 1-4-2.3l-1.4-2.4" />
        </>
      ) : icon === "🥤" ? (
        <>
          <path d="M18 3h5l-2 5" />
          <path d="M8 9h17l-2 18H10L8 9Z" />
          <path d="M9 14h15M12 6h9" />
        </>
      ) : icon === "🥫" ? (
        <>
          <path d="M8 6c0-1.7 3.6-3 8-3s8 1.3 8 3v20c0 1.7-3.6 3-8 3s-8-1.3-8-3V6Z" />
          <path d="M8 6c0 1.7 3.6 3 8 3s8-1.3 8-3M8 25c0 1.7 3.6 3 8 3s8-1.3 8-3M12 14h8" />
        </>
      ) : icon === "🍾" ? (
        <>
          <path d="M13 3h6v4l2 3v15a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3V10l2-3V3Z" />
          <path d="M13 7h6M11 14h10M14 3V1h4v2" />
        </>
      ) : icon === "📄" ? (
        <>
          <path d="M8 3h10l6 6v20H8V3Z" />
          <path d="M18 3v7h6M12 16h8M12 20h8M12 24h6" />
        </>
      ) : icon === "📦" ? (
        <>
          <path d="m4 10 12-6 12 6v13l-12 6-12-6V10Z" />
          <path d="m4 10 12 6 12-6M16 16v13M10 7l12 6" />
        </>
      ) : icon === "🔋" ? (
        <>
          <path d="M12 5V3h8v2M9 5h14v23H9V5Z" />
          <path d="M13 11h6M16 8v6M13 21h6" />
        </>
      ) : icon === "👕" ? (
        <>
          <path d="m11 5 5 3 5-3 8 4-4 7-4-2v13H11V14l-4 2-4-7 8-4Z" />
          <path d="M13 6a3 3 0 0 0 6 0" />
        </>
      ) : icon === "🍃" ? (
        <>
          <path d="M27 5C15 4 6 8 5 17c-.6 5 3.1 9 8 9 9 0 13-9 14-21Z" />
          <path d="M5 28c4-8 9-12 17-17M12 18l-1-5M17 14l5 1" />
        </>
      ) : icon === "🧴" ? (
        <>
          <path d="M13 3h6v4l2 2v3l3 3v13a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V15l3-3V9l2-2V3Z" />
          <path d="M13 3h6M11 12h10M12 19h8M16 7v2" />
        </>
      ) : icon === "🛢️" ? (
        <>
          <path d="M8 6c0-1.7 3.6-3 8-3s8 1.3 8 3v20c0 1.7-3.6 3-8 3s-8-1.3-8-3V6Z" />
          <path d="M8 6c0 1.7 3.6 3 8 3s8-1.3 8-3M8 12h16M8 21h16M8 26c0 1.7 3.6 3 8 3s8-1.3 8-3" />
          <path d="M13 16h6" />
        </>
      ) : icon === "💻" ? (
        <>
          <path d="M6 5h20v16H6zM3 25h26l-2 3H5l-2-3Z" />
          <path d="M10 9h12v8H10zM14 25v-4M18 25v-4" />
        </>
      ) : icon === "🛞" ? (
        <>
          <circle cx="16" cy="16" r="12" />
          <circle cx="16" cy="16" r="6" />
          <path d="m16 4 0 6m0 12v6M4 16h6m12 0h6M7.5 7.5l4.2 4.2m8.6 8.6 4.2 4.2m0-17-4.2 4.2m-8.6 8.6-4.2 4.2" />
        </>
      ) : icon === "🪵" ? (
        <>
          <path d="M5 10c0-2.2 4.9-4 11-4s11 1.8 11 4v12c0 2.2-4.9 4-11 4S5 24.2 5 22V10Z" />
          <path d="M5 10c0 2.2 4.9 4 11 4s11-1.8 11-4M11 18c2.5-1.5 7.5-1.5 10 0M11 22c2.5-1.5 7.5-1.5 10 0" />
        </>
      ) : icon === "🧱" ? (
        <>
          <path d="M4 7h11v7H4zM17 7h11v7H17zM4 16h7v8H4zM13 16h15v8H13z" />
          <path d="M15 7v7m-4 2v8m-7-11h24M4 16h24" />
        </>
      ) : icon === "🍌" ? (
        <>
          <path d="M7 7c1 8 7 14 17 17 1 0 2-1 2-2C16 18 12 12 11 5c-2 0-4 0-4 2Z" />
          <path d="M7 7 5 5m19 19 2 2M10 10c2 4 5 7 9 9" />
        </>
      ) : icon === "💡" ? (
        <>
          <path d="M16 3a9 9 0 0 0-5.5 16.1c1 .8 1.5 1.7 1.5 2.9h8c0-1.2.5-2.1 1.5-2.9A9 9 0 0 0 16 3Z" />
          <path d="M12 26h8m-7-4v4m6-4v4M13 28h6" />
        </>
      ) : icon === "🫙" ? (
        <>
          <path d="M11 4h10v4l2 3v16a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V11l2-3V4Z" />
          <path d="M11 8h10M9 14h14M13 4V2h6v2M13 19h6" />
        </>
      ) : icon === "🧵" ? (
        <>
          <path d="M11 5h10l2 4-2 3v13H11V12L9 9l2-4Z" />
          <path d="M11 9h10m-10 7h10m-10 4h10M14 3h4m-2 0v2" />
          <path d="M16 25v4" />
        </>
      ) : icon === "💊" ? (
        <>
          <path d="M10 7a6 6 0 0 1 8.5 0l6.5 6.5a6 6 0 0 1-8.5 8.5L10 15.5A6 6 0 0 1 10 7Z" />
          <path d="m13 18 8-8M8 5l2-2m14 24 2-2" />
        </>
      ) : (
        <>
          <path d="m12.1 6.1 2.2-3.8 3.2 5.5-2.2 3.8-1.2-2.1H9.8" />
          <path d="M9.8 9.5 7 14.3l-4.4-.1 3.2-5.5A4.6 4.6 0 0 1 9.8 6h2.8" />
          <path d="m24.1 12.3 4.4.1-3.2 5.5a4.6 4.6 0 0 1-4 2.3h-2.7" />
          <path d="m22.2 16.4 2.8-4.8-3.2-5.5-4.4.1" />
          <path d="m13 22.1-2.2 3.8-3.2-5.5 2.2-3.8 1.2 2.1h4.3" />
          <path d="M17.6 18.7H23l2.2 3.8-6.4.1a4.6 4.6 0 0 1-4-2.3l-1.4-2.4" />
        </>
      )}
    </svg>
  );
}

function StudentOverview({
  account,
  balance,
  deposits,
  onNavigate,
}: {
  account: LocalAccount;
  balance: number;
  deposits: DepositRequest[];
  onNavigate: (view: View) => void;
}) {
  const pendingCount = deposits.filter((deposit) => deposit.status === "pending").length;
  const approvedDeposits = deposits.filter((deposit) => deposit.status === "approved");
  const totalWeight = approvedDeposits
    .flatMap((deposit) => deposit.lines)
    .reduce((total, line) => total + (line.unit === "kg" ? (line.quantity ?? 0) : 0), 0);
  return (
    <>
      <section className={styles.studentWelcome}>
        <p className={styles.eyebrow}>RUANG PESERTA</p>
        <div className={styles.studentWelcomeLine}>
          <span className={styles.studentAvatar}>{account.name.trim().charAt(0).toUpperCase()}</span>
          <div>
            <h2>Halo, {account.name.split(" ")[0]}! 👋</h2>
            <small>{account.name}{account.className ? ` · Kelas ${account.className}` : ""}</small>
          </div>
        </div>
        <p>Kelola setoranmu dan pantau saldo rupiah dengan mudah.</p>
      </section>
      <section className={styles.studentBalanceHero}>
        <div>
          <span>Saldo saat ini</span>
          <strong>{formatRupiah(balance)}</strong>
        </div>
        <span className={styles.studentHeroLeaf} aria-hidden="true">♻</span>
      </section>
      <div className={styles.studentQuickActions}>
        <button onClick={() => onNavigate("deposits")} type="button">
          <span aria-hidden="true">＋</span>
          <strong>Setor sampah</strong>
          <small>Buat pengajuan</small>
        </button>
        <button onClick={() => onNavigate("balance")} type="button">
          <span aria-hidden="true">Rp</span>
          <strong>Lihat saldo</strong>
          <small>Saldo tersedia</small>
        </button>
        <button onClick={() => onNavigate("history")} type="button">
          <span aria-hidden="true">◷</span>
          <strong>Riwayat</strong>
          <small>Aktivitasmu</small>
        </button>
      </div>
      <div className={styles.statGrid}>
        <Stat label="Total sampah disetor" value={`${totalWeight.toLocaleString("id-ID", { maximumFractionDigits: 3 })} kg`} hint="Berat dari setoran disetujui" icon="kg" />
        <Stat label="Jumlah transaksi" value={String(approvedDeposits.length)} hint="Setoran berhasil dicatat" icon="↗" />
        <Stat label="Dalam pemeriksaan" value={String(pendingCount)} hint="Menunggu pengelola menimbang" icon="◷" />
      </div>
      <section className={styles.card}>
        <div className={styles.sectionTitle}>
          <div><h2>Ajukan setoran sampah</h2><p>Pilih jenis sampah dan unggah foto; berat akan dicatat pengelola.</p></div>
          <button className={styles.smallButton} onClick={() => onNavigate("deposits")} type="button">Buat pengajuan →</button>
        </div>
        {deposits.length === 0 ? (
          <EmptyState title="Belum ada setoran" detail="Setoran yang kamu ajukan dan statusnya akan muncul di sini." />
        ) : (
          <DepositRows deposits={deposits.slice(0, 5)} />
        )}
      </section>
      <p className={styles.greetingNote}>Selamat datang, {account.name}. Saldo rupiah ditambahkan setelah pengelola menyetujui hasil penimbangan.</p>
    </>
  );
}

function StudentDeposits({
  activeWasteTypes,
  busy,
  deposits,
  onCancelDeposit,
  onPhotoChange,
  onSelectWaste,
  onSubmit,
  onUnlistedWasteChange,
  onUnlistedWasteDescriptionChange,
  photoNames,
  photos,
  selectedIds,
  unlistedWaste,
  unlistedWasteDescription,
}: {
  activeWasteTypes: WasteType[];
  busy: boolean;
  deposits: DepositRequest[];
  onCancelDeposit: (id: string) => void;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectWaste: (id: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUnlistedWasteChange: (enabled: boolean) => void;
  onUnlistedWasteDescriptionChange: (description: string) => void;
  photoNames: string[];
  photos: string[];
  selectedIds: string[];
  unlistedWaste: boolean;
  unlistedWasteDescription: string;
}) {
  return (
    <div className={styles.twoColumns}>
      <form className={styles.cardForm} onSubmit={onSubmit}>
        <h2>Pengajuan baru</h2>
        <p>Jumlah atau berat aktual akan dicatat pengelola saat pemeriksaan.</p>
        {activeWasteTypes.length === 0 && !unlistedWaste && (
          <p className={styles.helperBanner}>Belum ada jenis sampah yang tersedia. Pilih opsi di bawah untuk mengajukan jenis lain.</p>
        )}
        {activeWasteTypes.length > 0 && !unlistedWaste && (
          <fieldset className={styles.wasteChoices}>
            <legend>Pilih jenis sampah</legend>
            {activeWasteTypes.map((item) => (
              <label className={styles.choice} key={item.id}>
                <input checked={selectedIds.includes(item.id)} onChange={() => onSelectWaste(item.id)} type="checkbox" />
                <WasteVisual item={item} />
                <span>{item.name}</span><small>{formatRupiah(item.pricePerUnit)}/{wasteUnitLabel(item.unit)}</small>
              </label>
            ))}
          </fieldset>
        )}
        <label className={styles.choice}>
          <input
            checked={unlistedWaste}
            onChange={(event) => onUnlistedWasteChange(event.target.checked)}
            type="checkbox"
          />
          <span>Jenis sampah belum tersedia</span>
        </label>
        {unlistedWaste && (
          <label className={styles.field}>
            Jelaskan jenis sampah
            <textarea
              maxLength={120}
              onChange={(event) => onUnlistedWasteDescriptionChange(event.target.value)}
              placeholder="Contoh: botol kaca berwarna"
              required
              value={unlistedWasteDescription}
            />
          </label>
        )}
        <label className={`${styles.field} ${styles.uploadField}`}>Foto setoran (maksimal 5)
          <span className={styles.uploadControl}>
            <input accept="image/*" disabled={photos.length >= 5} multiple onChange={onPhotoChange} type="file" />
            <span className={styles.uploadButton}>＋ Pilih foto</span>
            <span className={styles.uploadStatus}>
              {photos.length > 0 ? `${photos.length} foto dipilih` : "JPG, PNG, atau WebP · maksimal 5 foto"}
            </span>
          </span>
        </label>
        {photoNames.length > 0 && <ul className={styles.photoNames}>{photoNames.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul>}
        <button className={styles.primaryButton} disabled={busy || (!unlistedWaste && selectedIds.length === 0)} type="submit">{busy ? "Mengirim…" : "Kirim untuk diperiksa"}</button>
        <p className={styles.formHint}>Foto dikompres sebelum dikirim dan disimpan di server. Saldo bertambah setelah pengajuan disetujui.</p>
      </form>
      <section className={styles.card}>
        <SectionTitle title="Riwayat pengajuan" />
        {deposits.length === 0 ? (
          <EmptyState title="Belum ada pengajuan" detail="Pengajuan setoranmu akan tercatat di sini." />
        ) : (
          <DepositRows deposits={deposits} onCancel={onCancelDeposit} />
        )}
      </section>
    </div>
  );
}

function StudentHistory({ deposits }: { deposits: DepositRequest[] }) {
  const approvedDeposits = deposits.filter((deposit) => deposit.status === "approved");
  return (
    <section className={styles.card}>
      <SectionTitle title="Riwayat setoran" />
      <p className={styles.formHint}>Berat dan nilai di bawah ini dicatat oleh pengelola berdasarkan hasil penimbangan.</p>
      {approvedDeposits.length === 0 ? (
        <EmptyState title="Belum ada riwayat setoran" detail="Setoran yang sudah disetujui akan muncul di sini." />
      ) : (
        <div className={styles.depositList}>
          {approvedDeposits.flatMap((deposit) =>
            deposit.lines.map((line, index) => (
              <article className={styles.depositRow} key={`${deposit.id}-${index}`}>
                <div>
                  <strong>{line.wasteTypeName}</strong>
                  <small>{dateTime(deposit.reviewedAt ?? deposit.createdAt)} · {line.quantity ?? 0} {line.unit}</small>
                  <small>{formatRupiah(line.pricePerUnit ?? 0)}/{line.unit}</small>
                </div>
                <b className={styles.amountPositive}>{formatRupiah(line.amount ?? 0)}</b>
              </article>
            )),
          )}
        </div>
      )}
    </section>
  );
}

function DepositRows({
  deposits,
  onCancel,
}: {
  deposits: DepositRequest[];
  onCancel?: (id: string) => void;
}) {
  return (
    <div className={styles.depositList}>
      {deposits.map((deposit) => (
        <article className={styles.depositRow} key={deposit.id}>
          <div>
            <strong>{deposit.lines.map((line) => line.wasteTypeName).join(", ")}</strong>
            <small>{dateTime(deposit.createdAt)} · {deposit.photoCount ?? deposit.photos.length} foto</small>
            {deposit.status === "approved" && deposit.lines.map((line, index) => (
              <small key={`${deposit.id}-line-${index}`}>
                {line.quantity ?? 0} {line.unit} × {formatRupiah(line.pricePerUnit ?? 0)}
              </small>
            ))}
            {deposit.note && <small>Catatan: {deposit.note}</small>}
          </div>
          <div className={styles.depositStatus}>
            <StatusBadge status={deposit.status} />
            {deposit.status === "approved" && (
              <strong>
                {deposit.lines.some((line) => line.amount !== undefined)
                  ? formatRupiah(deposit.lines.reduce((sum, line) => sum + (line.amount ?? 0), 0))
                  : "Setoran lama"}
              </strong>
            )}
            {deposit.status === "pending" && onCancel && (
              <button className={styles.textButton} onClick={() => onCancel(deposit.id)} type="button">Batalkan</button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function StudentBalance({
  total,
  available,
}: {
  total: number;
  available: number;
}) {
  return (
    <section className={`${styles.card} ${styles.balanceBanner}`}>
      <div>
        <p>Saldo saat ini</p>
        <strong>{formatRupiah(total)}</strong>
        <small>Saldo tersedia: {formatRupiah(available)}</small>
      </div>
    </section>
  );
}

function withdrawalStatusName(status: WithdrawalRequest["status"]) {
  return {
    pending: "Menunggu persetujuan",
    processing: "Proses pencairan",
    paid: "Sudah ditransfer",
    rejected: "Ditolak",
    cancelled: "Dibatalkan",
  }[status];
}

function WithdrawalStatus({ status }: { status: WithdrawalRequest["status"] }) {
  const className = {
    pending: styles.statusPending,
    processing: styles.statusProcessing,
    paid: styles.statusApproved,
    rejected: styles.statusRejected,
    cancelled: styles.statusMuted,
  }[status];
  return <span className={`${styles.status} ${className}`}>{withdrawalStatusName(status)}</span>;
}

function StudentWithdrawals({
  requests,
  available,
  reserved,
  maxAmount,
  editingId,
  amount,
  withdrawAll,
  destinationType,
  institution,
  accountName,
  accountNumber,
  onAmount,
  onWithdrawAll,
  onDestinationType,
  onInstitution,
  onAccountName,
  onAccountNumber,
  onSubmit,
  onEdit,
  onCancel,
  onReset,
}: {
  requests: WithdrawalRequest[];
  available: number;
  reserved: number;
  maxAmount: number;
  editingId: string;
  amount: string;
  withdrawAll: boolean;
  destinationType: "bank" | "ewallet";
  institution: string;
  accountName: string;
  accountNumber: string;
  onAmount: (value: string) => void;
  onWithdrawAll: (value: boolean) => void;
  onDestinationType: (value: "bank" | "ewallet") => void;
  onInstitution: (value: string) => void;
  onAccountName: (value: string) => void;
  onAccountNumber: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (request: WithdrawalRequest) => void;
  onCancel: (requestId: string) => void;
  onReset: () => void;
}) {
  const currentActiveRequest = requests.find(
    (request) => request.status === "pending" || request.status === "processing",
  );
  return (
    <div className={styles.twoColumns}>
      {!currentActiveRequest || currentActiveRequest.status === "pending" ? (
        <form className={styles.cardForm} onSubmit={onSubmit}>
          <h2>{editingId ? "Ubah pengajuan" : "Ajukan pencairan saldo"}</h2>
          <p>
            Isi nominal dan rekening tujuan. Pengajuan tersimpan di riwayat dan saldo ditahan
            sampai pengelola menyelesaikan pemeriksaan.
          </p>
          <div className={styles.withdrawalBalance}>
            <span>Saldo tersedia</span>
            <strong>{formatRupiah(available)}</strong>
            {reserved > 0 && <small>{formatRupiah(reserved)} sedang ditahan pada pengajuan lain.</small>}
          </div>
          <label className={styles.field}>
            Nominal pencairan (Rp)
            <input
              max={maxAmount}
              min="1"
              onChange={(event) => {
                onWithdrawAll(false);
                onAmount(event.target.value);
              }}
              placeholder="Masukkan nominal"
              required={!withdrawAll}
              step="1"
              type="number"
              value={withdrawAll ? maxAmount : amount}
            />
          </label>
          <label className={styles.checkField}>
            <input
              checked={withdrawAll}
              disabled={maxAmount <= 0}
              onChange={(event) => {
                onWithdrawAll(event.target.checked);
                if (event.target.checked) onAmount(String(maxAmount));
              }}
              type="checkbox"
            />
            Tarik semua saldo tersedia ({formatRupiah(maxAmount)})
          </label>
          <label className={styles.field}>
            Jenis tujuan
            <select
              onChange={(event) => onDestinationType(event.target.value as "bank" | "ewallet")}
              value={destinationType}
            >
              <option value="bank">Rekening bank</option>
              <option value="ewallet">E-wallet</option>
            </select>
          </label>
          <label className={styles.field}>
            {destinationType === "bank" ? "Nama bank" : "Nama e-wallet"}
            <input
              maxLength={60}
              onChange={(event) => onInstitution(event.target.value)}
              placeholder={destinationType === "bank" ? "Contoh: BCA" : "Contoh: GoPay"}
              required
              value={institution}
            />
          </label>
          <label className={styles.field}>
            Nama pemilik rekening
            <input maxLength={100} onChange={(event) => onAccountName(event.target.value)} required value={accountName} />
          </label>
          <label className={styles.field}>
            Nomor rekening/e-wallet
            <input
              autoComplete="off"
              inputMode="numeric"
              maxLength={24}
              onChange={(event) => onAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 24))}
              pattern="[0-9]{6,24}"
              placeholder="6–24 digit"
              required
              value={accountNumber}
            />
          </label>
          <div className={styles.buttonRow}>
            <button className={styles.primaryButton} disabled={available <= 0 || maxAmount <= 0} type="submit">
              {editingId ? "Simpan perubahan" : "Kirim pengajuan"}
            </button>
            {editingId && <button className={styles.secondaryButton} onClick={onReset} type="button">Batal edit</button>}
          </div>
          <p className={styles.formHint}>Saldo akan ditahan sampai pengajuan ditolak, dibatalkan, atau transfer selesai.</p>
        </form>
      ) : (
        <section className={styles.cardForm}>
          <h2>Pengajuan sedang diproses</h2>
          <p>Satu pengajuan aktif per peserta. Pengajuan baru dapat dibuat setelah proses ini selesai.</p>
          <WithdrawalSummary request={currentActiveRequest} />
        </section>
      )}
      <section className={styles.card}>
        <SectionTitle title="Riwayat pengajuan pencairan" />
        {requests.length === 0 ? (
          <EmptyState title="Belum ada pengajuan" detail="Pengajuan pencairan dan statusnya akan tercatat di sini." />
        ) : (
          <div className={styles.withdrawalList}>
            {requests.map((request) => (
              <article className={styles.withdrawalRow} key={request.id}>
                <div className={styles.withdrawalRowHeading}>
                  <div><strong>{formatRupiah(request.amount)}</strong><small>{request.institution} · {maskAccountNumber(request.accountNumber)}</small></div>
                  <WithdrawalStatus status={request.status} />
                </div>
                <small>Diajukan {dateTime(request.createdAt)}</small>
                {request.note && <p className={styles.withdrawalNote}>Catatan admin: {request.note}</p>}
                {request.status === "pending" && (
                  <div className={styles.buttonRow}>
                    <button className={styles.smallButton} onClick={() => onEdit(request)} type="button">Edit</button>
                    <button className={styles.textButton} onClick={() => onCancel(request.id)} type="button">Batalkan pengajuan</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function WithdrawalSummary({ request }: { request: WithdrawalRequest }) {
  return (
    <div className={styles.withdrawalSummary}>
      <WithdrawalStatus status={request.status} />
      <strong>{formatRupiah(request.amount)}</strong>
      <span>{request.destinationType === "bank" ? "Bank" : "E-wallet"} · {request.institution}</span>
      <span>{request.accountName} · {maskAccountNumber(request.accountNumber)}</span>
      <small>Diajukan {dateTime(request.createdAt)}</small>
    </div>
  );
}

function ManagerWithdrawals({
  requests,
  students,
  filter,
  onFilter,
  selected,
  onOpen,
  onClose,
  note,
  onNote,
  onApprove,
  onReject,
  onMarkPaid,
}: {
  requests: WithdrawalRequest[];
  students: LocalAccount[];
  filter: string;
  onFilter: (filter: string) => void;
  selected?: WithdrawalRequest;
  onOpen: (request: WithdrawalRequest) => void;
  onClose: () => void;
  note: string;
  onNote: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onMarkPaid: (requestId: string) => void;
}) {
  const studentMap = new Map(students.map((student) => [student.id, student]));
  return (
    <>
      <section className={styles.card}>
        <div className={styles.toolbar}>
          <label className={styles.filterLabel}>
            Status pengajuan
            <select onChange={(event) => onFilter(event.target.value)} value={filter}>
              <option value="active">Aktif</option>
              <option value="pending">Menunggu persetujuan</option>
              <option value="processing">Proses pencairan</option>
              <option value="paid">Sudah ditransfer</option>
              <option value="rejected">Ditolak</option>
              <option value="cancelled">Dibatalkan</option>
              <option value="all">Semua riwayat</option>
            </select>
          </label>
          <span className={styles.resultCount}>{requests.length} pengajuan</span>
        </div>
        {requests.length === 0 ? (
          <EmptyState title="Tidak ada pengajuan pencairan" detail="Pengajuan peserta akan muncul di sini." />
        ) : (
          <DataTable headers={["Peserta", "Nominal", "Tujuan transfer", "Diajukan", "Status", "Aksi"]}>
            {requests.map((request) => (
              <tr key={request.id}>
                <td><strong>{studentMap.get(request.studentId)?.name ?? "Peserta tidak ditemukan"}</strong><small>{studentMap.get(request.studentId)?.identifier ?? ""}</small></td>
                <td>{formatRupiah(request.amount)}</td>
                <td>{request.institution}<small>{request.accountName} · {maskAccountNumber(request.accountNumber)}</small></td>
                <td>{dateTime(request.createdAt)}</td>
                <td><WithdrawalStatus status={request.status} /></td>
                <td><button className={styles.smallButton} onClick={() => onOpen(request)} type="button">Detail</button></td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
      {selected && (
        <section className={styles.card}>
          <div className={styles.sectionTitle}>
            <div><h2>Detail pengajuan</h2><p>{studentMap.get(selected.studentId)?.name ?? "Peserta"} · {dateTime(selected.createdAt)}</p></div>
            <button className={styles.textButton} onClick={onClose} type="button">Tutup</button>
          </div>
          <WithdrawalSummary request={selected} />
          {studentMap.get(selected.studentId)?.whatsapp && (
            <a
              className={styles.secondaryButton}
              href={whatsappUrl(
                studentMap.get(selected.studentId)?.whatsapp ?? "",
                `Halo ${studentMap.get(selected.studentId)?.name ?? ""}, saya admin Bank Sampah terkait pengajuan pencairan ${formatRupiah(selected.amount)}.`,
              )}
              rel="noreferrer"
              target="_blank"
            >
              Hubungi peserta via WhatsApp
            </a>
          )}
          {selected.status === "pending" && (
            <div className={styles.reviewForm}>
              <label className={styles.field}>
                Catatan persetujuan atau alasan penolakan
                <textarea maxLength={240} onChange={(event) => onNote(event.target.value)} placeholder="Alasan wajib diisi jika menolak" value={note} />
              </label>
              <div className={styles.buttonRow}>
                <button className={styles.primaryButton} onClick={onApprove} type="button">Setujui & proses transfer</button>
                <button className={styles.dangerButton} disabled={!note.trim()} onClick={onReject} type="button">Tolak pengajuan</button>
              </div>
              <p className={styles.formHint}>Setelah disetujui, peserta tidak dapat mengubah atau membatalkan pengajuan.</p>
            </div>
          )}
          {selected.status === "processing" && (
            <div className={styles.reviewForm}>
              <p className={styles.formHint}>Lakukan transfer manual ke tujuan di atas. Setelah transfer berhasil, tandai pengajuan selesai.</p>
              <button className={styles.primaryButton} onClick={() => onMarkPaid(selected.id)} type="button">Transfer selesai — catat pencairan</button>
            </div>
          )}
          {selected.note && <p className={styles.withdrawalNote}>Catatan: {selected.note}</p>}
        </section>
      )}
    </>
  );
}

function TransactionRows({
  entries,
  students,
}: {
  entries: BusinessData["walletEntries"];
  students: LocalAccount[];
}) {
  const studentMap = new Map(students.map((student) => [student.id, student]));
  return (
    <div className={styles.depositList}>
      {entries.map((entry) => (
        <article className={styles.depositRow} key={entry.id}>
          <div><strong>{studentMap.get(entry.studentId)?.name ?? "Peserta"}</strong><small>{entryName(entry.kind)} · {entry.description}</small></div>
          <strong className={entry.amount > 0 ? styles.amountPositive : styles.amountNegative}>{entry.amount > 0 ? "+" : "−"}{formatRupiah(Math.abs(entry.amount))}</strong>
        </article>
      ))}
    </div>
  );
}

function ProfileMenuItem({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: string;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button className={styles.profileMenuItem} onClick={onClick} type="button">
      <span className={styles.profileMenuIcon} aria-hidden="true">{icon}</span>
      <span className={styles.profileMenuText}><strong>{title}</strong><small>{detail}</small></span>
      <span className={styles.profileMenuArrow} aria-hidden="true">›</span>
    </button>
  );
}

function ProfileDetails({
  account,
  onSave,
}: {
  account: LocalAccount;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className={styles.settingsCard} onSubmit={onSave}>
      <div className={styles.profileCard}>
        <div className={styles.profileAvatar}>{account.name.trim().charAt(0).toUpperCase()}</div>
        <div><h2>{account.name}</h2><p>{account.role === "manager" ? "Pengelola" : "Peserta didik"}</p></div>
      </div>
      <div className={styles.profileFormGrid}>
        <label className={styles.field}>
          Nama lengkap
          <input defaultValue={account.name} maxLength={100} name="name" required />
        </label>
        <label className={styles.field}>
          {account.role === "manager" ? "Nama pengguna" : "NISN"}
          <input disabled value={account.identifier} />
          <small className={styles.fieldHint}>Identitas masuk tidak dapat diubah dari prototipe.</small>
        </label>
        {account.role === "student" && (
          <label className={styles.field}>
            Kelas
            <input defaultValue={account.className ?? ""} maxLength={30} name="className" required />
          </label>
        )}
        <label className={styles.field}>
          Nomor WhatsApp
          <input defaultValue={account.whatsapp} maxLength={24} name="whatsapp" required type="tel" />
        </label>
      </div>
      <button className={styles.primaryButton} type="submit">Simpan data akun</button>
    </form>
  );
}

function SecuritySettings({ onSave }: { onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className={styles.settingsCard} onSubmit={onSave}>
      <div className={styles.settingsIntro}>
        <span className={styles.settingsIcon}>♧</span>
        <div><h2>Ubah kata sandi</h2><p>Gunakan kata sandi baru minimal 8 karakter.</p></div>
      </div>
      <div className={styles.profileFormGrid}>
        <label className={styles.field}>
          Kata sandi saat ini
          <input autoComplete="current-password" minLength={8} name="currentPassword" required type="password" />
        </label>
        <span />
        <label className={styles.field}>
          Kata sandi baru
          <input autoComplete="new-password" minLength={8} name="newPassword" required type="password" />
        </label>
        <label className={styles.field}>
          Ulangi kata sandi baru
          <input autoComplete="new-password" minLength={8} name="confirmPassword" required type="password" />
        </label>
      </div>
      <p className={styles.settingsWarning}>Kata sandi diperbarui dengan aman melalui server.</p>
      <button className={styles.primaryButton} type="submit">Perbarui kata sandi</button>
    </form>
  );
}

function SettingsOptions({
  manager,
  notificationsEnabled,
  onContact,
  onPreferences,
  onHelp,
}: {
  manager: boolean;
  notificationsEnabled: boolean;
  onContact: () => void;
  onPreferences: () => void;
  onHelp: () => void;
}) {
  return (
    <section className={styles.settingsMenuCard}>
      <p className={styles.profileMenuHeading}>PREFERENSI</p>
      {manager && (
        <ProfileMenuItem icon="↗" title="Nomor WhatsApp pengelola" detail="Kontak yang digunakan peserta untuk menghubungi pengelola" onClick={onContact} />
      )}
      <ProfileMenuItem
        icon="♧"
        title="Notifikasi dalam website"
        detail={`Saat ini ${notificationsEnabled ? "aktif" : "nonaktif"}`}
        onClick={onPreferences}
      />
      <p className={styles.profileMenuHeading}>PENYIMPANAN</p>
      <ProfileMenuItem icon="◈" title="Penyimpanan data" detail="Informasi data akun dan aktivitas" onClick={onHelp} />
      <div className={styles.settingsInlineInfo}>
        Data akun dan aktivitas tersimpan di server dan tersedia saat kamu masuk dari perangkat lain.
      </div>
    </section>
  );
}

function ManagerContactSettings({
  manager,
  whatsapp,
  onSave,
  onHelp,
}: {
  manager: boolean;
  whatsapp: string;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onHelp: () => void;
}) {
  if (!manager) {
    return (
      <section className={styles.settingsCard}>
        <div className={styles.settingsIntro}>
          <span className={styles.settingsIcon}>↗</span>
          <div><h2>Kontak pengelola</h2><p>Hubungi pengelola melalui WhatsApp untuk menanyakan setoran atau pencairan saldo.</p></div>
        </div>
        {whatsapp ? (
          <a
            className={styles.primaryButton}
            href={whatsappUrl(whatsapp, "Halo pengelola, saya ingin bertanya tentang Bank Sampah Sekolah Merdeka.")}
            rel="noreferrer"
            target="_blank"
          >
            Buka WhatsApp pengelola
          </a>
        ) : (
          <p className={styles.settingsWarning}>Nomor WhatsApp pengelola belum diatur.</p>
        )}
        <button className={styles.textButton} onClick={onHelp} type="button">Tentang penyimpanan data</button>
      </section>
    );
  }

  return (
    <form className={styles.settingsCard} onSubmit={onSave}>
      <div className={styles.settingsIntro}>
        <span className={styles.settingsIcon}>↗</span>
        <div><h2>Nomor WhatsApp pengelola</h2><p>Peserta akan memakai nomor ini saat menghubungi pengelola.</p></div>
      </div>
      <label className={styles.field}>
        Nomor WhatsApp aktif
        <input
          defaultValue={whatsapp}
          maxLength={24}
          name="managerWhatsapp"
          placeholder="Contoh: 081234567890"
          required
          type="tel"
        />
      </label>
      <p className={styles.settingsWarning}>Perubahan tersimpan di server dan digunakan pada tautan WhatsApp peserta.</p>
      <button className={styles.primaryButton} type="submit">Simpan nomor kontak</button>
    </form>
  );
}

function NotificationPreferences({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <section className={styles.settingsMenuCard}>
      <p className={styles.profileMenuHeading}>NOTIFIKASI DI DALAM WEBSITE</p>
      <label className={styles.preferenceToggle}>
        <span>
          <strong>Aktifkan notifikasi</strong>
          <small>Beritahu aktivitas setoran, saldo, dan pencairan.</small>
        </span>
        <input checked={enabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      </label>
      <p className={styles.settingsWarning}>Preferensi tersimpan di server. Notifikasi email dan WhatsApp otomatis belum tersedia.</p>
    </section>
  );
}

function BusinessDataHelp({
  manager,
  whatsapp,
  onContactSettings,
}: {
  manager: boolean;
  whatsapp: string;
  onContactSettings: () => void;
}) {
  return (
    <div className={styles.helpCenter}>
      <section className={styles.helpCard}>
        <div className={styles.helpCardHeading}>
          <span className={styles.helpCardIcon} aria-hidden="true">↗</span>
          <div>
            <h2>{manager ? "Panduan pengelola" : "Panduan peserta"}</h2>
            <p>{manager ? "Kelola kegiatan Bank Sampah dari pengajuan hingga pencairan." : "Ikuti langkah berikut untuk menyetor sampah dan menggunakan saldo."}</p>
          </div>
        </div>
        <ol className={styles.helpSteps}>
          {manager ? (
            <>
              <li><span>Atur jenis sampah, satuan, dan tarif rupiah di menu Tarif rupiah.</span></li>
              <li><span>Tambahkan peserta melalui impor data siswa, lalu bagikan kredensial sementara secara pribadi.</span></li>
              <li><span>Periksa setoran, masukkan berat atau volume aktual, lalu setujui atau tolak dengan alasan.</span></li>
              <li><span>Tinjau pengajuan pencairan. Setelah transfer manual dilakukan, catat sebagai sudah dibayar.</span></li>
            </>
          ) : (
            <>
              <li><span>Pilih jenis sampah yang tersedia dan kirim pengajuan setoran. Foto dapat disertakan sebagai bukti.</span></li>
              <li><span>Tunggu pengelola memeriksa dan memasukkan berat atau volume aktual.</span></li>
              <li><span>Setoran yang disetujui menambah saldo rupiah sesuai jumlah aktual dan tarif.</span></li>
              <li><span>Ajukan pencairan dari menu Pencairan. Transfer dilakukan oleh pengelola secara manual.</span></li>
            </>
          )}
        </ol>
      </section>

      <section className={styles.helpCard}>
        <div className={styles.helpCardHeading}>
          <span className={styles.helpCardIcon} aria-hidden="true">◈</span>
          <div>
            <h2>Data dan privasi</h2>
            <p>Informasi akun dan aktivitas disimpan melalui server aplikasi.</p>
          </div>
        </div>
        <ul className={styles.helpList}>
          <li>Profil, setoran, saldo, pencairan, notifikasi, dan preferensi tersimpan di database.</li>
          <li>Foto setoran dan jenis sampah yang diunggah juga disimpan di server.</li>
          <li>Data dapat diakses dari perangkat lain setelah masuk ke akun.</li>
          <li>Browser menyimpan cookie sesi untuk menjaga autentikasi; data bisnis tidak disimpan sebagai salinan lokal.</li>
        </ul>
      </section>

      <section className={`${styles.helpCard} ${styles.helpContactCard}`}>
        <div className={styles.helpCardHeading}>
          <span className={styles.helpCardIcon} aria-hidden="true">?</span>
          <div>
            <h2>{manager ? "Informasi kontak" : "Perlu bantuan?"}</h2>
            <p>{manager ? "Pastikan peserta dapat menghubungi pengelola jika membutuhkan bantuan." : "Hubungi pengelola jika ada pertanyaan tentang setoran atau pencairan."}</p>
          </div>
        </div>
        {manager ? (
          <button className={styles.helpAction} onClick={onContactSettings} type="button">
            {whatsapp ? "Periksa nomor WhatsApp pengelola" : "Atur nomor WhatsApp pengelola"}
            <span aria-hidden="true">→</span>
          </button>
        ) : whatsapp ? (
          <a
            className={styles.helpAction}
            href={whatsappUrl(whatsapp, "Halo pengelola, saya ingin bertanya tentang Bank Sampah Sekolah Merdeka.")}
            rel="noreferrer"
            target="_blank"
          >
            Hubungi pengelola melalui WhatsApp
            <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <p className={styles.helpContactNote}>Kontak WhatsApp pengelola belum tersedia. Silakan hubungi pihak sekolah.</p>
        )}
      </section>
      <p className={styles.helpFootnote}>Saldo dan tarif menggunakan rupiah langsung. Aplikasi tidak menggunakan sistem poin, dan pencairan belum terhubung ke pembayaran otomatis.</p>
    </div>
  );
}
