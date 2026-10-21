import { forwardRef } from "react";
import {
  type IconProps as TablerIconProps,
  type TablerIcon,
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconAlertTriangle,
  IconArchive,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconArrowUpRight,
  IconArrowsDiagonal,
  IconBell,
  IconBook,
  IconBrain,
  IconBrush,
  IconBulb,
  IconCalendar,
  IconCheck,
  IconChecks,
  IconChevronDown,
  IconChevronRight,
  IconCircle,
  IconCircleCheck,
  IconClock,
  IconCode,
  IconColorPicker,
  IconColumns2,
  IconCommand,
  IconCube,
  IconGauge,
  IconCopy,
  IconCornerDownLeft,
  IconCornerDownRight,
  IconDeviceDesktop,
  IconDots,
  IconDotsVertical,
  IconEdit,
  IconExternalLink,
  IconFile,
  IconFileCode2,
  IconFlask2,
  IconFolder,
  IconFolderOpen,
  IconGitBranch,
  IconGlobe,
  IconHeart,
  IconHome,
  IconInbox,
  IconInfoCircle,
  IconLayoutRows,
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconLibrary,
  IconLink,
  IconLoader,
  IconLoader2,
  IconLock,
  IconMail,
  IconMenu,
  IconMessage,
  IconMessageCircle,
  IconMoon,
  IconNetwork,
  IconPalette,
  IconPaperclip,
  IconPencil,
  IconPhoto,
  IconPin,
  IconPinnedOff,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipForward,
  IconPlugConnected,
  IconPlus,
  IconPointFilled,
  IconRectangle,
  IconRefresh,
  IconRocket,
  IconRotate,
  IconSearch,
  IconSelector,
  IconSettings,
  IconSettings2,
  IconShield,
  IconShieldCheck,
  IconSquare,
  IconStack2,
  IconStar,
  IconSun,
  IconTerminal,
  IconTerminal2,
  IconTextWrap,
  IconTool,
  IconTrash,
  IconUser,
  IconUsers,
  IconX,
} from "@tabler/icons-react";

// Keep the UI's size, strokeWidth, SVG props, and ref contract consistent.
type IconProps = Omit<TablerIconProps, "strokeWidth"> & {
  strokeWidth?: number;
};
function icon(name: string, Glyph: TablerIcon) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(
    ({ size = 24, strokeWidth = 1.5, ...props }, ref) => (
      <Glyph
        ref={ref}
        size={size}
        stroke={strokeWidth}
        aria-hidden="true"
        focusable="false"
        data-icon-library="tabler"
        data-icon={name}
        {...props}
      />
    ),
  );
  Icon.displayName = name;
  return Icon;
}

export const Archive = icon("Archive", IconArchive);
export const ArrowDown = icon("ArrowDown", IconArrowDown);
export const ArrowDownIcon = icon("ArrowDownIcon", IconArrowDown);
export const ArrowLeft = icon("ArrowLeft", IconArrowLeft);
export const ArrowRight = icon("ArrowRight", IconArrowRight);
export const ArrowUp = icon("ArrowUp", IconArrowUp);
export const ArrowUpRight = icon("ArrowUpRight", IconArrowUpRight);
export const Bell = icon("Bell", IconBell);
export const BookOpen = icon("BookOpen", IconBook);
export const Brain = icon("Brain", IconBrain);
export const Calendar = icon("Calendar", IconCalendar);
export const Check = icon("Check", IconCheck);
export const CheckCheck = icon("CheckCheck", IconChecks);
export const CheckIcon = icon("CheckIcon", IconCheck);
export const ChevronDown = icon("ChevronDown", IconChevronDown);
export const ChevronRight = icon("ChevronRight", IconChevronRight);
export const ChevronRightIcon = icon("ChevronRightIcon", IconChevronRight);
export const ChevronsUpDown = icon("ChevronsUpDown", IconSelector);
export const Circle = icon("Circle", IconCircle);
export const CircleAlert = icon("CircleAlert", IconAlertCircle);
export const Clock = icon("Clock", IconClock);
export const Cube = icon("Cube", IconCube);
export const Gauge = icon("Gauge", IconGauge);
export const Code = icon("Code", IconCode);
export const Columns2 = icon("Columns2", IconColumns2);
export const Command = icon("Command", IconCommand);
export const Copy = icon("Copy", IconCopy);
export const CopyIcon = icon("CopyIcon", IconCopy);
export const CornerDownLeft = icon("CornerDownLeft", IconCornerDownLeft);
export const CornerDownRight = icon("CornerDownRight", IconCornerDownRight);
export const Dot = icon("Dot", IconPointFilled);
export const Ellipsis = icon("Ellipsis", IconDots);
export const EllipsisVertical = icon("EllipsisVertical", IconDotsVertical);
export const ExternalLink = icon("ExternalLink", IconExternalLink);
export const FileCode2 = icon("FileCode2", IconFileCode2);
export const FlaskConical = icon("FlaskConical", IconFlask2);
export const Folder = icon("Folder", IconFolder);
export const FolderOpen = icon("FolderOpen", IconFolderOpen);
export const GitBranch = icon("GitBranch", IconGitBranch);
export const Globe = icon("Globe", IconGlobe);
export const Heart = icon("Heart", IconHeart);
export const Home = icon("Home", IconHome);
export const ImageIcon = icon("ImageIcon", IconPhoto);
export const Inbox = icon("Inbox", IconInbox);
export const Info = icon("Info", IconInfoCircle);
export const Layers = icon("Layers", IconStack2);
export const Lightbulb = icon("Lightbulb", IconBulb);
export const Link = icon("Link", IconLink);
export const Loader = icon("Loader", IconLoader);
export const LoaderCircle = icon("LoaderCircle", IconLoader2);
export const Lock = icon("Lock", IconLock);
export const Mail = icon("Mail", IconMail);
export const Menu = icon("Menu", IconMenu);
export const MessageCircle = icon("MessageCircle", IconMessageCircle);
export const MessageSquare = icon("MessageSquare", IconMessage);
export const Monitor = icon("Monitor", IconDeviceDesktop);
export const Moon = icon("Moon", IconMoon);
export const Network = icon("Network", IconNetwork);
export const Paintbrush = icon("Paintbrush", IconBrush);
export const Palette = icon("Palette", IconPalette);
export const Paperclip = icon("Paperclip", IconPaperclip);
export const PanelLeft = icon("PanelLeft", IconLayoutSidebar);
export const PanelRight = icon("PanelRight", IconLayoutSidebarRight);
export const Pause = icon("Pause", IconPlayerPause);
export const Pencil = icon("Pencil", IconPencil);
export const Pin = icon("Pin", IconPin);
export const PinOff = icon("PinOff", IconPinnedOff);
export const Pipette = icon("Pipette", IconColorPicker);
export const Play = icon("Play", IconPlayerPlay);
export const PlugZap = icon("PlugZap", IconPlugConnected);
export const Plus = icon("Plus", IconPlus);
export const RectangleHorizontal = icon("RectangleHorizontal", IconRectangle);
export const RefreshCw = icon("RefreshCw", IconRefresh);
export const Rocket = icon("Rocket", IconRocket);
export const RotateCcw = icon("RotateCcw", IconRotate);
export const Rows3 = icon("Rows3", IconLayoutRows);
export const Scaling = icon("Scaling", IconArrowsDiagonal);
export const Search = icon("Search", IconSearch);
export const Settings = icon("Settings", IconSettings);
export const Settings2 = icon("Settings2", IconSettings2);
export const Shield = icon("Shield", IconShield);
export const ShieldCheck = icon("ShieldCheck", IconShieldCheck);
export const SkipForward = icon("SkipForward", IconPlayerSkipForward);
export const SlidersHorizontal = icon(
  "SlidersHorizontal",
  IconAdjustmentsHorizontal,
);
export const Square = icon("Square", IconSquare);
export const SquareLibrary = icon("SquareLibrary", IconLibrary);
export const SquarePen = icon("SquarePen", IconEdit);
export const Star = icon("Star", IconStar);
export const Sun = icon("Sun", IconSun);
export const Terminal = icon("Terminal", IconTerminal);
export const TerminalSquare = icon("TerminalSquare", IconTerminal2);
export const Trash2 = icon("Trash2", IconTrash);
export const User = icon("User", IconUser);
export const Users = icon("Users", IconUsers);
export const WrapText = icon("WrapText", IconTextWrap);
export const Wrench = icon("Wrench", IconTool);
export const X = icon("X", IconX);
export const File = icon("File", IconFile);
export const CheckCircle = icon("CheckCircle", IconCircleCheck);
export const AlertTriangle = icon("AlertTriangle", IconAlertTriangle);
