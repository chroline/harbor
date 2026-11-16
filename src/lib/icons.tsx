import { forwardRef } from "react";
import {
  HugeiconsIcon,
  type HugeiconsIconProps,
  type IconSvgElement,
} from "@hugeicons/react";
import {
  Alert02Icon,
  AlertCircleIcon,
  Archive01Icon,
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  ArrowMoveDownRightIcon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowTurnBackwardIcon,
  ArrowUp02Icon,
  ArrowUpRight01Icon,
  Attachment01Icon,
  BookOpen01Icon,
  Brain02Icon,
  BubbleChatIcon,
  Calendar03Icon,
  Cancel01Icon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  CircleIcon,
  Clock01Icon,
  CodeIcon,
  ColorPickerIcon,
  CommandIcon,
  CommandLineIcon,
  ComputerIcon,
  ComputerTerminal01Icon,
  Copy01Icon,
  CubeIcon,
  DashboardSpeed01Icon,
  Delete02Icon,
  DotIcon,
  FavouriteIcon,
  File01Icon,
  FileAddIcon,
  FileCodeIcon,
  FlashIcon,
  Folder01Icon,
  FolderOpenIcon,
  GitBranchIcon,
  GlobeIcon,
  HierarchyIcon,
  Home01Icon,
  Idea01Icon,
  Image01Icon,
  InboxIcon,
  InformationCircleIcon,
  Layers01Icon,
  LayoutTwoColumnIcon,
  LibraryIcon,
  Link01Icon,
  LinkSquare02Icon,
  Loading02Icon,
  Loading03Icon,
  LockIcon,
  Mail01Icon,
  Menu01Icon,
  Message01Icon,
  Moon02Icon,
  MoreHorizontalIcon,
  MoreVerticalIcon,
  NextIcon,
  Notification01Icon,
  PaintBoardIcon,
  PaintBrush01Icon,
  PauseIcon,
  PencilEdit01Icon,
  PencilEdit02Icon,
  Pin02Icon,
  PinOffIcon,
  PlayIcon,
  Plug01Icon,
  PlusSignIcon,
  RectangularIcon,
  RefreshIcon,
  Resize01Icon,
  Rocket01Icon,
  RotateLeft01Icon,
  Rows3Icon,
  Search01Icon,
  SecurityCheckIcon,
  Settings01Icon,
  Settings02Icon,
  Shield01Icon,
  SidebarLeftIcon,
  SidebarRightIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  StarIcon,
  Sun01Icon,
  TestTube01Icon,
  TextWrapIcon,
  Tick02Icon,
  TickDouble02Icon,
  UnfoldMoreIcon,
  UserIcon,
  UserMultipleIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";

// Every icon in the app comes from Hugeicons (free stroke-rounded set) through
// this file, keeping the UI's size, strokeWidth, SVG props, and ref contract
// consistent. Export names are role names kept stable across icon libraries.
type IconProps = Omit<HugeiconsIconProps, "icon" | "altIcon" | "showAlt">;
function icon(
  name: string,
  glyph: IconSvgElement,
  defaults: Partial<IconProps> = {},
) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(
    ({ size = 24, strokeWidth = 1.5, ...props }, ref) => (
      <HugeiconsIcon
        ref={ref}
        icon={glyph}
        size={size}
        strokeWidth={strokeWidth}
        aria-hidden="true"
        focusable="false"
        data-icon-library="hugeicons"
        data-icon={name}
        {...defaults}
        {...props}
      />
    ),
  );
  Icon.displayName = name;
  return Icon;
}

export const Archive = icon("Archive", Archive01Icon);
export const ArrowDown = icon("ArrowDown", ArrowDown02Icon);
export const ArrowDownIcon = icon("ArrowDownIcon", ArrowDown02Icon);
export const ArrowLeft = icon("ArrowLeft", ArrowLeft02Icon);
export const ArrowRight = icon("ArrowRight", ArrowRight02Icon);
export const ArrowUp = icon("ArrowUp", ArrowUp02Icon);
export const ArrowUpRight = icon("ArrowUpRight", ArrowUpRight01Icon);
export const Bell = icon("Bell", Notification01Icon);
export const Bolt = icon("Bolt", FlashIcon);
export const BookOpen = icon("BookOpen", BookOpen01Icon);
export const Brain = icon("Brain", Brain02Icon);
export const Calendar = icon("Calendar", Calendar03Icon);
export const Check = icon("Check", Tick02Icon);
export const CheckCheck = icon("CheckCheck", TickDouble02Icon);
export const CheckIcon = icon("CheckIcon", Tick02Icon);
export const ChevronDown = icon("ChevronDown", ArrowDown01Icon);
export const ChevronLeft = icon("ChevronLeft", ArrowLeft01Icon);
export const ChevronRight = icon("ChevronRight", ArrowRight01Icon);
export const ChevronRightIcon = icon("ChevronRightIcon", ArrowRight01Icon);
export const ChevronsUpDown = icon("ChevronsUpDown", UnfoldMoreIcon);
export const Circle = icon("Circle", CircleIcon);
export const CircleAlert = icon("CircleAlert", AlertCircleIcon);
export const Clock = icon("Clock", Clock01Icon);
export const Cube = icon("Cube", CubeIcon);
export const Gauge = icon("Gauge", DashboardSpeed01Icon);
export const Code = icon("Code", CodeIcon);
export const Columns2 = icon("Columns2", LayoutTwoColumnIcon);
export const Command = icon("Command", CommandIcon);
export const Copy = icon("Copy", Copy01Icon);
export const CopyIcon = icon("CopyIcon", Copy01Icon);
export const CornerDownLeft = icon("CornerDownLeft", ArrowTurnBackwardIcon);
export const CornerDownRight = icon("CornerDownRight", ArrowMoveDownRightIcon);
// Tabler's point-filled was a solid dot; fill Hugeicons' outline dot to match.
export const Dot = icon("Dot", DotIcon, { fill: "currentColor" });
export const Ellipsis = icon("Ellipsis", MoreHorizontalIcon);
export const EllipsisVertical = icon("EllipsisVertical", MoreVerticalIcon);
export const ExternalLink = icon("ExternalLink", LinkSquare02Icon);
export const FileCode2 = icon("FileCode2", FileCodeIcon);
export const FilePlus = icon("FilePlus", FileAddIcon);
export const FlaskConical = icon("FlaskConical", TestTube01Icon);
export const Folder = icon("Folder", Folder01Icon);
export const FolderOpen = icon("FolderOpen", FolderOpenIcon);
export const GitBranch = icon("GitBranch", GitBranchIcon);
export const Globe = icon("Globe", GlobeIcon);
export const Heart = icon("Heart", FavouriteIcon);
export const Home = icon("Home", Home01Icon);
export const ImageIcon = icon("ImageIcon", Image01Icon);
export const Inbox = icon("Inbox", InboxIcon);
export const Info = icon("Info", InformationCircleIcon);
export const Layers = icon("Layers", Layers01Icon);
export const Lightbulb = icon("Lightbulb", Idea01Icon);
export const Link = icon("Link", Link01Icon);
export const ListCheck = icon("ListCheck", CheckListIcon);
export const Loader = icon("Loader", Loading03Icon);
export const LoaderCircle = icon("LoaderCircle", Loading02Icon);
export const Lock = icon("Lock", LockIcon);
export const Mail = icon("Mail", Mail01Icon);
export const Menu = icon("Menu", Menu01Icon);
export const MessageCircle = icon("MessageCircle", BubbleChatIcon);
export const MessageSquare = icon("MessageSquare", Message01Icon);
export const Monitor = icon("Monitor", ComputerIcon);
export const Moon = icon("Moon", Moon02Icon);
export const Network = icon("Network", HierarchyIcon);
export const Paintbrush = icon("Paintbrush", PaintBrush01Icon);
export const Palette = icon("Palette", PaintBoardIcon);
export const Paperclip = icon("Paperclip", Attachment01Icon);
export const PanelLeft = icon("PanelLeft", SidebarLeftIcon);
export const PanelRight = icon("PanelRight", SidebarRightIcon);
export const Pause = icon("Pause", PauseIcon);
export const Pencil = icon("Pencil", PencilEdit01Icon);
export const Pin = icon("Pin", Pin02Icon);
export const PinOff = icon("PinOff", PinOffIcon);
export const Pipette = icon("Pipette", ColorPickerIcon);
export const Play = icon("Play", PlayIcon);
export const PlugZap = icon("PlugZap", Plug01Icon);
export const Plus = icon("Plus", PlusSignIcon);
export const RectangleHorizontal = icon("RectangleHorizontal", RectangularIcon);
export const RefreshCw = icon("RefreshCw", RefreshIcon);
export const Rocket = icon("Rocket", Rocket01Icon);
export const RotateCcw = icon("RotateCcw", RotateLeft01Icon);
export const Rows3 = icon("Rows3", Rows3Icon);
export const Scaling = icon("Scaling", Resize01Icon);
export const Search = icon("Search", Search01Icon);
export const Settings = icon("Settings", Settings01Icon);
export const Settings2 = icon("Settings2", Settings02Icon);
export const Shield = icon("Shield", Shield01Icon);
export const ShieldCheck = icon("ShieldCheck", SecurityCheckIcon);
export const SkipForward = icon("SkipForward", NextIcon);
export const SlidersHorizontal = icon("SlidersHorizontal", SlidersHorizontalIcon);
export const Square = icon("Square", SquareIcon);
export const SquareLibrary = icon("SquareLibrary", LibraryIcon);
export const SquarePen = icon("SquarePen", PencilEdit02Icon);
export const Star = icon("Star", StarIcon);
export const Sun = icon("Sun", Sun01Icon);
export const Terminal = icon("Terminal", CommandLineIcon);
export const TerminalSquare = icon("TerminalSquare", ComputerTerminal01Icon);
export const Trash2 = icon("Trash2", Delete02Icon);
export const User = icon("User", UserIcon);
export const Users = icon("Users", UserMultipleIcon);
export const WrapText = icon("WrapText", TextWrapIcon);
export const Wrench = icon("Wrench", Wrench01Icon);
export const X = icon("X", Cancel01Icon);
export const File = icon("File", File01Icon);
export const CheckCircle = icon("CheckCircle", CheckmarkCircle02Icon);
export const AlertTriangle = icon("AlertTriangle", Alert02Icon);
