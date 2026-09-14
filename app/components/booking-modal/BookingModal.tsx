"use client";

import { format, startOfTomorrow } from "date-fns";
import Image from "next/image";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DateRange } from "react-day-picker";
import { createPortal } from "react-dom";
import { CommonButton } from "@/app/components/common-button/CommonButton";
import { ProgressiveImage } from "@/app/components/progressive-image/ProgressiveImage";
import { Calendar } from "@/app/components/ui/calendar";
import { useTranslation } from "@/app/contexts/TranslationContext";
import { clearUtmParams, getTrafficSource, useUtmParams } from "@/app/hooks";
import styles from "./BookingModal.module.css";

const STRAPI_URL =
  process.env.NEXT_PUBLIC_STRAPI_URL || "https://strapi.saint6.studio";

export interface BookingRoomData {
  title: string;
  pricePerHour: string;
  description: string;
  space: string;
  width: string;
  ceilingHeight: string;
  wallType?: string;
  imageUrl: string;
  gallery?: { url: string; alt?: string }[];
}

export interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  rooms: BookingRoomData[];
  initialRoomIndex?: number;
}

type ModalState = "details" | "booking" | "success";

// Generate 30-minute time slots: 00:00, 00:30, 01:00, ..., 23:30
const ALL_TIME_SLOTS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    ALL_TIME_SLOTS.push(
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    );
  }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function ClockIcon({ time = "16:00" }: { time?: string }) {
  const [h, m] = time.split(":").map(Number);
  const hourAngle = ((h % 12) / 12) * 360 + (m / 60) * 30;
  const minuteAngle = (m / 60) * 360;

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <line
        x1="12"
        y1="12"
        x2="12"
        y2="8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        transform={`rotate(${hourAngle}, 12, 12)`}
      />
      <line
        x1="12"
        y1="12"
        x2="12"
        y2="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        transform={`rotate(${minuteAngle}, 12, 12)`}
      />
    </svg>
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-().]{7,}$/;

function getFilteredTimeSlots(
  field: "from" | "to",
  dateFrom: Date | undefined,
  dateTo: Date | undefined,
  timeFrom: string
): string[] {
  let slots = ALL_TIME_SLOTS;
  const now = new Date();
  const todayStr = now.toDateString();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (field === "from") {
    // If from date is today, remove past time slots
    if (dateFrom && dateFrom.toDateString() === todayStr) {
      slots = slots.filter((s) => timeToMinutes(s) > currentMinutes);
    }
  } else {
    // If to date is today, remove past time slots
    if (dateTo && dateTo.toDateString() === todayStr) {
      slots = slots.filter((s) => timeToMinutes(s) > currentMinutes);
    }
    // If same day, to time must be after from time
    const isSameDay =
      dateFrom && dateTo && dateFrom.toDateString() === dateTo.toDateString();
    if (isSameDay && timeFrom) {
      const fromMinutes = timeToMinutes(timeFrom);
      slots = slots.filter((s) => timeToMinutes(s) > fromMinutes);
    }
  }

  return slots;
}

export function BookingModal({
  isOpen,
  onClose,
  rooms,
  initialRoomIndex = 0,
}: BookingModalProps) {
  const { t } = useTranslation();
  const utmParams = useUtmParams();
  const [modalState, setModalState] = useState<ModalState>("details");
  const [selectedRoomIndex, setSelectedRoomIndex] = useState(initialRoomIndex);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [openTimePicker, setOpenTimePicker] = useState<"from" | "to" | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const timeFromRef = useRef<HTMLDivElement>(null);
  const timeToRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const imageThumbnailsRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    timeFrom: "",
    timeTo: "",
    name: "",
    email: "",
    phone: "",
  });
  const [fieldErrors, setFieldErrors] = useState({ email: false, phone: false });

  // Debounced regex validation for email and phone
  useEffect(() => {
    const timer = setTimeout(() => {
      setFieldErrors({
        email: formData.email.length > 0 && !EMAIL_REGEX.test(formData.email),
        phone: formData.phone.length > 0 && !PHONE_REGEX.test(formData.phone),
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.email, formData.phone]);

  const room = rooms[selectedRoomIndex];
  const images =
    room?.gallery && room.gallery.length > 0
      ? room.gallery
      : room
        ? [{ url: room.imageUrl, alt: room.title }]
        : [];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setModalState("details");
      setSelectedRoomIndex(initialRoomIndex);
      setCurrentImageIndex(0);
      setDateRange(undefined);
      setIsCalendarOpen(false);
      setOpenTimePicker(null);
      setFormData({
        timeFrom: "",
        timeTo: "",
        name: "",
        email: "",
        phone: "",
      });
      setFieldErrors({ email: false, phone: false });
      setShowErrors(false);
    }
  }, [isOpen, initialRoomIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.overflow = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen, handleKeyDown]);

  // Close calendar on click outside
  useEffect(() => {
    if (!isCalendarOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCalendarOpen]);

  // Close time picker on click outside
  useEffect(() => {
    if (!openTimePicker) return;
    const ref = openTimePicker === "from" ? timeFromRef : timeToRef;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenTimePicker(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openTimePicker]);

  // Tab scroll arrows visibility
  const [tabArrows, setTabArrows] = useState({ left: false, right: false });

  const updateTabArrows = useCallback(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    setTabArrows({
      left: tabs.scrollLeft > 1,
      right: tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1,
    });
  }, []);

  // Convert vertical wheel/trackpad events to horizontal scroll on tabs
  useEffect(() => {
    if (!isOpen) return;
    const tabs = tabsRef.current;
    if (!tabs) return;
    // Scroll active tab into view
    const activeTab = tabs.children[selectedRoomIndex] as HTMLElement | undefined;
    if (activeTab) {
      activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    updateTabArrows();
    const handleWheel = (e: WheelEvent) => {
      if (tabs.scrollWidth <= tabs.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        tabs.scrollLeft += e.deltaY;
      }
    };
    tabs.addEventListener("wheel", handleWheel, { passive: false });
    tabs.addEventListener("scroll", updateTabArrows);
    return () => {
      tabs.removeEventListener("wheel", handleWheel);
      tabs.removeEventListener("scroll", updateTabArrows);
    };
  }, [isOpen, modalState, updateTabArrows]);

  // Scroll active image thumbnail into view
  useEffect(() => {
    const container = imageThumbnailsRef.current;
    const thumb = container?.children[currentImageIndex] as HTMLElement | undefined;
    if (thumb) thumb.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [currentImageIndex]);

  const scrollTabs = (direction: "left" | "right") => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    tabs.scrollBy({ left: direction === "left" ? -120 : 120, behavior: "smooth" });
  };

  const handleDateSelect = (range: DateRange | undefined) => {
    setDateRange(range);

    // Clear times that become invalid with the new date selection
    if (range?.from) {
      const todayStr = new Date().toDateString();
      const isFromToday = range.from.toDateString() === todayStr;

      setFormData((prev) => {
        const updated = { ...prev };

        // If from date is today, check if timeFrom is still valid
        if (isFromToday && prev.timeFrom) {
          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          if (timeToMinutes(prev.timeFrom) <= currentMinutes) {
            updated.timeFrom = "";
            updated.timeTo = "";
          }
        }

        // If same day, check if timeTo is still valid
        if (range.from && range.to) {
          const isSameDay =
            range.from.toDateString() === range.to.toDateString();
          if (isSameDay && updated.timeFrom && prev.timeTo) {
            if (timeToMinutes(prev.timeTo) <= timeToMinutes(updated.timeFrom)) {
              updated.timeTo = "";
            }
          }
        }

        return updated;
      });
    }

    // Auto-close when a full range is selected (from and to are different days)
    if (
      range?.from &&
      range?.to &&
      range.from.getTime() !== range.to.getTime()
    ) {
      setIsCalendarOpen(false);
    }
  };

  const handleRoomTabClick = (index: number) => {
    setSelectedRoomIndex(index);
    setCurrentImageIndex(0);
    const tabs = tabsRef.current;
    const tab = tabs?.children[index] as HTMLElement | undefined;
    if (tab) tab.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTimeSelect = (field: "from" | "to", value: string) => {
    setFormData((prev) => {
      const updated = {
        ...prev,
        [field === "from" ? "timeFrom" : "timeTo"]: value,
      };

      // If setting "from" time, clear "to" if it becomes invalid on same day
      if (field === "from" && updated.timeTo) {
        const isSameDay =
          dateRange?.from &&
          dateRange?.to &&
          dateRange.from.toDateString() === dateRange.to.toDateString();
        if (isSameDay && timeToMinutes(updated.timeTo) <= timeToMinutes(value)) {
          updated.timeTo = "";
        }
      }

      return updated;
    });
    setOpenTimePicker(null);
  };

  const handleTimePickerToggle = (field: "from" | "to") => {
    setOpenTimePicker((prev) => (prev === field ? null : field));
    setIsCalendarOpen(false);
  };

  // Time dropdown scroll arrows
  const timeDropdownRef = useRef<HTMLDivElement>(null);
  const [timeDropdownArrows, setTimeDropdownArrows] = useState({ up: false, down: false });

  const updateTimeDropdownArrows = useCallback(() => {
    const el = timeDropdownRef.current;
    if (!el) return;
    setTimeDropdownArrows({
      up: el.scrollTop > 1,
      down: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    });
  }, []);

  const timeDropdownCallbackRef = useCallback((el: HTMLDivElement | null) => {
    timeDropdownRef.current = el;
    if (!el) return;
    const selected = el.querySelector("[data-selected='true']");
    const target = selected || el.querySelector("[data-time='12:00']");
    if (target) target.scrollIntoView({ block: "center" });
    requestAnimationFrame(() => {
      setTimeDropdownArrows({
        up: el.scrollTop > 1,
        down: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
      });
    });
  }, []);

  useEffect(() => {
    const el = timeDropdownRef.current;
    if (!el || !openTimePicker) return;
    el.addEventListener("scroll", updateTimeDropdownArrows);
    return () => el.removeEventListener("scroll", updateTimeDropdownArrows);
  }, [openTimePicker, updateTimeDropdownArrows]);

  const scrollTimeDropdown = (direction: "up" | "down") => {
    const el = timeDropdownRef.current;
    if (!el) return;
    el.scrollBy({ top: direction === "up" ? -100 : 100, behavior: "smooth" });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const isValid =
      formData.name &&
      EMAIL_REGEX.test(formData.email) &&
      PHONE_REGEX.test(formData.phone) &&
      dateRange?.from &&
      formData.timeFrom &&
      formData.timeTo;
    if (!isValid) {
      setShowErrors(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const trafficSource = getTrafficSource(utmParams);

      // Calculate estimated budget: pricePerHour × total hours
      // Build start/end timestamps and compute continuous hours
      const priceNum = Number(room.pricePerHour.replace(/[^0-9]/g, "")) || 0;
      const dateFrom = dateRange!.from!;
      const dateTo = dateRange?.to || dateFrom;
      const [startH, startM] = formData.timeFrom.split(":").map(Number);
      const [endH, endM] = formData.timeTo.split(":").map(Number);
      const start = new Date(dateFrom);
      start.setHours(startH, startM, 0, 0);
      const end = new Date(dateTo);
      end.setHours(endH, endM, 0, 0);
      const totalHours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
      const estimatedBudget = Math.round(priceNum * totalHours);

      const response = await fetch(`${STRAPI_URL}/api/booking-submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            roomTitle: room.title,
            dateFrom: dateRange?.from ? format(dateRange.from, "dd/MM/yyyy") : "",
            dateTo: dateRange?.to ? format(dateRange.to, "dd/MM/yyyy") : "",
            timeFrom: formData.timeFrom,
            timeTo: formData.timeTo,
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            estimatedBudget,
            trafficSource,
            utmSource: utmParams.utm_source || null,
            utmMedium: utmParams.utm_medium || null,
            utmCampaign: utmParams.utm_campaign || null,
            landingPage: utmParams._landing || window.location.pathname,
          },
        }),
      });
      if (!response.ok) throw new Error("Failed to submit booking");

      let enquiryId: string | number | undefined;
      try {
        const result: { data?: { id?: string | number } } = await response.json();
        enquiryId = result.data?.id;
      } catch {
        // A malformed tracking identifier must not hide a successful enquiry.
      }

      // Push conversion event to GTM dataLayer
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: "booking_form_submit",
        form_name: "booking",
        traffic_source: trafficSource,
        utm_source: utmParams.utm_source || undefined,
        utm_medium: utmParams.utm_medium || undefined,
        utm_campaign: utmParams.utm_campaign || undefined,
        booking_room: room.title,
        estimated_budget: estimatedBudget,
        contact_name: formData.name,
        contact_email: formData.email,
        transaction_id:
          enquiryId != null ? `booking-${enquiryId}` : undefined,
        value: 1,
        currency: "VND",
      });

      clearUtmParams();
      setModalState("success");
    } catch (error) {
      console.error("Booking submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !room || !mounted) return null;

  const currentImage = images[currentImageIndex];

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t.STUDIO_RENTAL.ROOMS.MAKE_BOOKING}
        onClick={(e) => e.stopPropagation()}
      >
      {/* Image Panel */}
      <div className={styles.imagePanel}>
        <ProgressiveImage
          src={currentImage.url}
          alt={currentImage.alt || room.title}
          fill
          className={styles.roomImage}
          sizes="66vw"
          priority
        />

        {images.length > 1 && (
          <>
            <button
              className={`${styles.imageNav} ${styles.prevButton}`}
              onClick={() =>
                setCurrentImageIndex(
                  (prev) => (prev - 1 + images.length) % images.length
                )
              }
              aria-label="Previous image"
            >
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path
                  d="M30 12L18 24L30 36"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className={`${styles.imageNav} ${styles.nextButton}`}
              onClick={() =>
                setCurrentImageIndex((prev) => (prev + 1) % images.length)
              }
              aria-label="Next image"
            >
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path
                  d="M18 12L30 24L18 36"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        )}

        {images.length > 1 && (
          <div className={styles.imageFooter}>
            <div className={styles.imageCounter}>
              {String(currentImageIndex + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}
            </div>
            <div className={styles.imageThumbnails} ref={imageThumbnailsRef}>
              {images.map((img, index) => (
                <button
                  key={index}
                  className={`${styles.imageThumbnail} ${index === currentImageIndex ? styles.imageThumbnailActive : ""}`}
                  onClick={() => setCurrentImageIndex(index)}
                  aria-label={`Go to image ${index + 1}`}
                >
                  <Image
                    src={img.url}
                    alt=""
                    fill
                    className={styles.imageThumbnailImg}
                    sizes="60px"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Close button — modal level for correct mobile positioning */}
      <button
        className={styles.closeButton}
        onClick={onClose}
        aria-label="Close"
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <path
            d="M14 14L34 34"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M34 14L14 34"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Content Panel */}
      <div className={styles.contentPanel}>

        {/* ==================== */}
        {/* STATE: DETAILS       */}
        {/* ==================== */}
        {modalState === "details" && (
          <div className={styles.detailsContent}>
            <div className={styles.tabsWrapper}>
              {tabArrows.left && (
                <button
                  className={`${styles.tabArrow} ${styles.tabArrowLeft}`}
                  onClick={() => scrollTabs("left")}
                  aria-label="Scroll tabs left"
                >
                  &lt;
                </button>
              )}
              <div className={styles.roomTabs} ref={tabsRef}>
                {rooms.map((r, index) => (
                  <button
                    key={index}
                    className={`${styles.roomTab} ${
                      index === selectedRoomIndex ? styles.roomTabActive : ""
                    }`}
                    onClick={() => handleRoomTabClick(index)}
                  >
                    {r.title}
                  </button>
                ))}
              </div>
              {tabArrows.right && (
                <button
                  className={`${styles.tabArrow} ${styles.tabArrowRight}`}
                  onClick={() => scrollTabs("right")}
                  aria-label="Scroll tabs right"
                >
                  &gt;
                </button>
              )}
            </div>

            <div className={styles.roomInfo}>
              <h2 className={styles.roomName}>{room.title}</h2>
              <p className={styles.roomPrice}>
                {room.pricePerHour}
                {t.STUDIO_RENTAL.ROOMS.PER_HOUR}
              </p>
              <p className={styles.roomDescription}>{room.description}</p>
            </div>

            <div className={styles.specsGrid}>
              {room.space && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>
                    {t.STUDIO_RENTAL.ROOMS.SPACE}
                  </span>
                  <span className={styles.specValue}>{room.space}</span>
                </div>
              )}
              {room.width && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>
                    {t.STUDIO_RENTAL.ROOMS.WIDTH}
                  </span>
                  <span className={styles.specValue}>{room.width}</span>
                </div>
              )}
              {room.ceilingHeight && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>
                    {t.STUDIO_RENTAL.ROOMS.CEILING_HEIGHT}
                  </span>
                  <span className={styles.specValue}>{room.ceilingHeight}</span>
                </div>
              )}
              {room.wallType && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>
                    {t.STUDIO_RENTAL.BOOKING.WALL_TYPE}
                  </span>
                  <span className={styles.specValue}>{room.wallType}</span>
                </div>
              )}
            </div>

            <div className={styles.detailsActions}>
              <CommonButton
                variant="primary"
                size="md"
                onClick={() => setModalState("booking")}
              >
                {t.STUDIO_RENTAL.ROOMS.MAKE_BOOKING}
              </CommonButton>
            </div>
          </div>
        )}

        {/* ==================== */}
        {/* STATE: BOOKING       */}
        {/* ==================== */}
        {modalState === "booking" && (
          <div className={styles.bookingContent}>
            <button
              className={styles.backLink}
              onClick={() => setModalState("details")}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 18L9 12L15 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{t.STUDIO_RENTAL.BOOKING.VIEW_OTHER_STUDIO}</span>
            </button>

            <h2 className={styles.bookingHeading}>
              {t.STUDIO_RENTAL.ROOMS.MAKE_BOOKING}
            </h2>

            <form
              className={styles.bookingForm}
              onSubmit={handleSubmit}
              noValidate
            >
              {/* Date range picker */}
              <div className={styles.dateRangeContainer} ref={calendarRef}>
                <button
                  type="button"
                  className={`${styles.dateRangeWrapper} ${showErrors && !dateRange?.from ? styles.inputError : ""}`}
                  onClick={() => {
                    setIsCalendarOpen((prev) => !prev);
                    setOpenTimePicker(null);
                  }}
                >
                  <span className={styles.dateRangeDisplay}>
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          <span className={styles.dateRangeValue}>
                            {format(dateRange.from, "dd/MM/yyyy")}
                          </span>
                          <span className={styles.dateRangeSeparator}>
                            —
                          </span>
                          <span className={styles.dateRangeValue}>
                            {format(dateRange.to, "dd/MM/yyyy")}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className={styles.dateRangeValue}>
                            {format(dateRange.from, "dd/MM/yyyy")}
                          </span>
                          <span className={styles.dateRangeSeparator}>
                            —
                          </span>
                          <span className={styles.dateRangePlaceholder}>
                            DD/MM/YYYY
                          </span>
                        </>
                      )
                    ) : (
                      <>
                        <span className={styles.dateRangePlaceholder}>
                          DD/MM/YYYY
                        </span>
                        <span className={styles.dateRangeSeparator}>
                          —
                        </span>
                        <span className={styles.dateRangePlaceholder}>
                          DD/MM/YYYY
                        </span>
                      </>
                    )}
                  </span>
                  <label className={styles.inputLabel}>
                    {t.STUDIO_RENTAL.BOOKING.DATE}*
                  </label>
                  <span className={styles.inputIcon}>
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <rect
                        x="3"
                        y="4"
                        width="18"
                        height="18"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M16 2V6M8 2V6M3 10H21"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </button>
                {isCalendarOpen && (
                  <div className={styles.calendarDropdown}>
                    <Calendar
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={handleDateSelect}
                      numberOfMonths={1}
                      disabled={{ before: startOfTomorrow() }}
                      startMonth={startOfTomorrow()}
                    />
                  </div>
                )}
              </div>

              {/* Time fields */}
              <div className={styles.timeRow}>
                <div className={styles.timePickerContainer} ref={timeFromRef}>
                  <button
                    type="button"
                    className={`${styles.timePickerButton} ${openTimePicker === "from" ? styles.timePickerButtonOpen : ""} ${showErrors && !formData.timeFrom ? styles.inputError : ""}`}
                    onClick={() => handleTimePickerToggle("from")}
                    aria-label={t.STUDIO_RENTAL.BOOKING.FROM}
                  >
                    {formData.timeFrom || (
                      <span className={styles.timePickerPlaceholder}>
                        --:--
                      </span>
                    )}
                  </button>
                  <label className={styles.inputLabel}>
                    {t.STUDIO_RENTAL.BOOKING.FROM}*
                  </label>
                  <span className={styles.inputIcon}>
                    <ClockIcon time={formData.timeFrom || undefined} />
                  </span>
                  {openTimePicker === "from" && (
                    <div className={styles.timePickerDropdownWrapper}>
                      {timeDropdownArrows.up && (
                        <button type="button" className={`${styles.timeDropdownArrow} ${styles.timeDropdownArrowUp}`} onClick={() => scrollTimeDropdown("up")}>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 10L8 6L12 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      )}
                      <div
                        className={styles.timePickerDropdown}
                        ref={timeDropdownCallbackRef}
                      >
                        {getFilteredTimeSlots(
                          "from",
                          dateRange?.from,
                          dateRange?.to,
                          formData.timeFrom
                        ).map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            className={`${styles.timePickerOption} ${formData.timeFrom === slot ? styles.timePickerOptionSelected : ""}`}
                            data-selected={formData.timeFrom === slot}
                            data-time={slot}
                            onClick={() => handleTimeSelect("from", slot)}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                      {timeDropdownArrows.down && (
                        <button type="button" className={`${styles.timeDropdownArrow} ${styles.timeDropdownArrowDown}`} onClick={() => scrollTimeDropdown("down")}>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className={styles.timePickerContainer} ref={timeToRef}>
                  <button
                    type="button"
                    className={`${styles.timePickerButton} ${openTimePicker === "to" ? styles.timePickerButtonOpen : ""} ${showErrors && !formData.timeTo ? styles.inputError : ""}`}
                    onClick={() => handleTimePickerToggle("to")}
                    aria-label={t.STUDIO_RENTAL.BOOKING.TO}
                  >
                    {formData.timeTo || (
                      <span className={styles.timePickerPlaceholder}>
                        --:--
                      </span>
                    )}
                  </button>
                  <label className={styles.inputLabel}>
                    {t.STUDIO_RENTAL.BOOKING.TO}*
                  </label>
                  <span className={styles.inputIcon}>
                    <ClockIcon time={formData.timeTo || undefined} />
                  </span>
                  {openTimePicker === "to" && (
                    <div className={styles.timePickerDropdownWrapper}>
                      {timeDropdownArrows.up && (
                        <button type="button" className={`${styles.timeDropdownArrow} ${styles.timeDropdownArrowUp}`} onClick={() => scrollTimeDropdown("up")}>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 10L8 6L12 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      )}
                      <div
                        className={styles.timePickerDropdown}
                        ref={timeDropdownCallbackRef}
                      >
                        {getFilteredTimeSlots(
                          "to",
                          dateRange?.from,
                          dateRange?.to,
                          formData.timeFrom
                        ).map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            className={`${styles.timePickerOption} ${formData.timeTo === slot ? styles.timePickerOptionSelected : ""}`}
                            data-selected={formData.timeTo === slot}
                            data-time={slot}
                            onClick={() => handleTimeSelect("to", slot)}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                      {timeDropdownArrows.down && (
                        <button type="button" className={`${styles.timeDropdownArrow} ${styles.timeDropdownArrowDown}`} onClick={() => scrollTimeDropdown("down")}>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Name */}
              <div className={styles.inputWrapper}>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder=" "
                  className={`${styles.input} ${showErrors && !formData.name ? styles.inputError : ""}`}
                  required
                />
                <label className={styles.inputLabel}>
                  {t.STUDIO_RENTAL.BOOKING.NAME}*
                </label>
              </div>

              {/* Email */}
              <div className={styles.inputWrapper}>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder=" "
                  className={`${styles.input} ${fieldErrors.email || (showErrors && !EMAIL_REGEX.test(formData.email)) ? styles.inputError : ""}`}
                  required
                />
                <label className={styles.inputLabel}>
                  {t.STUDIO_RENTAL.BOOKING.EMAIL}*
                </label>
              </div>

              {/* Phone */}
              <div className={styles.inputWrapper}>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder=" "
                  className={`${styles.input} ${fieldErrors.phone || (showErrors && !PHONE_REGEX.test(formData.phone)) ? styles.inputError : ""}`}
                  required
                />
                <label className={styles.inputLabel}>
                  {t.STUDIO_RENTAL.BOOKING.PHONE}*
                </label>
              </div>

              {/* Submit */}
              <CommonButton
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubmitting}
                className={styles.submitButton}
              >
                <span style={{ visibility: isSubmitting ? "hidden" : "visible" }}>
                  {t.STUDIO_RENTAL.BOOKING.RESERVE}
                </span>
                {isSubmitting && (
                  <span className={styles.submitSpinner}>
                    {t.STUDIO_RENTAL.FORM.SENDING}
                  </span>
                )}
              </CommonButton>
            </form>
          </div>
        )}

        {/* ==================== */}
        {/* STATE: SUCCESS       */}
        {/* ==================== */}
        {modalState === "success" && (
          <div className={styles.successContent}>
            <div className={styles.successBody}>
              <div className={styles.successText}>
                <h2 className={styles.successHeading}>
                  {t.STUDIO_RENTAL.BOOKING.SUCCESS_TITLE}
                </h2>
                <p className={styles.successMessage}>
                  {t.STUDIO_RENTAL.BOOKING.SUCCESS_MESSAGE}
                </p>
              </div>
              <CommonButton variant="primary" size="lg" onClick={onClose}>
                {t.STUDIO_RENTAL.BOOKING.BACK_TO_STUDIOS}
              </CommonButton>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>,
    document.body
  );
}
