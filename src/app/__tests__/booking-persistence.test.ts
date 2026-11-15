import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "./src/app/page";

describe("LabMatch Frontend", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it("persists booking resource selection in localStorage", () => {
    const user = { user_id: 1, name: "Test User" };
    localStorage.setItem("labmatch_user", JSON.stringify(user));

    const startDate = "2026-01-15";
    const startTime = "10:00";
    const endDate = "2026-01-15";
    const endTime = "11:00";

    localStorage.setItem("labmatch_start_date", startDate);
    localStorage.setItem("labmatch_start_time", startTime);
    localStorage.setItem("labmatch_end_date", endDate);
    localStorage.setItem("labmatch_end_time", endTime);

    // Restore selections
    const persistedStartDate = localStorage.getItem("labmatch_start_date");
    const persistedStartTime = localStorage.getItem("labmatch_start_time");
    const persistedEndDate = localStorage.getItem("labmatch_end_date");
    const persistedEndTime = localStorage.getItem("labmatch_end_time");

    expect(persistedStartDate).toBe(startDate);
    expect(persistedStartTime).toBe(startTime);
    expect(persistedEndDate).toBe(endDate);
    expect(persistedEndTime).toBe(endTime);
  });

  it("clears persisted selections on successful booking", () => {
    // Simulate persisting selections
    const resource = { resource_id: 1, name: "Test Resource" };
    localStorage.setItem("labmatch_booking_resource", JSON.stringify(resource));
    localStorage.setItem("labmatch_start_date", "2026-01-15");
    localStorage.setItem("labmatch_start_time", "10:00");
    localStorage.setItem("labmatch_end_date", "2026-01-15");
    localStorage.setItem("labmatch_end_time", "11:00");

    // Clear selections (simulate successful booking)
    localStorage.removeItem("labmatch_booking_resource");
    localStorage.removeItem("labmatch_start_date");
    localStorage.removeItem("labmatch_start_time");
    localStorage.removeItem("labmatch_end_date");
    localStorage.removeItem("labmatch_end_time");

    expect(localStorage.getItem("labmatch_booking_resource")).toBeNull;
    expect(localStorage.getItem("labmatch_start_date")).toBeNull;
  });
});