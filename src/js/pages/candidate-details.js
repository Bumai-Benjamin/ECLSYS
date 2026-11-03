// Candidate details page script (moved out of an inline block for SEC-11).
$(document).ready(function() {
    
    // Initialize Material Dashboard JS
    if (typeof md !== "undefined" && typeof md.initDashboardPageCharts === "function") {
      try {
        md.initDashboardPageCharts();
      } catch (error) {
        console.warn("Dashboard charts failed to load:", error);
      }
    }

    // Initialize Perfect Scrollbar if available
    if ($('.sidebar .sidebar-wrapper').length) {
      try {
        $('.sidebar .sidebar-wrapper, .main-panel').perfectScrollbar();
      } catch (err) {
        console.warn("Perfect Scrollbar not loaded or failed.", err);
      }
    }

    console.log("Dashboard scripts loaded successfully.");
  });
