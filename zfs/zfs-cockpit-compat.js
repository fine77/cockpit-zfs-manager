(function () {
  "use strict";

  if (typeof window.jQuery === "undefined") {
    return;
  }

  var $ = window.jQuery;

  if (!$.fn.modal) {
    $.fn.modal = function (action) {
      return this.each(function () {
        var $modal = $(this);
        if (action === "hide") {
          $modal.removeClass("in").attr("aria-hidden", "true").hide();
        } else {
          $modal.addClass("in").attr("aria-hidden", "false").show();
        }
      });
    };

    $(document).on("click", "[data-toggle='modal']", function (ev) {
      var target = $(this).attr("data-target") || $(this).attr("href");
      if (!target || target.charAt(0) !== "#") return;
      ev.preventDefault();
      $(target).modal("show");
    });

    $(document).on("click", "[data-dismiss='modal']", function (ev) {
      var $modal = $(this).closest(".modal");
      if (!$modal.length) return;
      ev.preventDefault();
      $modal.modal("hide");
    });
  }

  if (!$.fn.dropdown) {
    $.fn.dropdown = function () {
      return this;
    };

    $(document).on("click", ".dropdown-toggle", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var $parent = $(this).closest(".dropdown");
      $(".dropdown.open").not($parent).removeClass("open");
      $parent.toggleClass("open");
    });

    $(document).on("click", function () {
      $(".dropdown.open").removeClass("open");
    });
  }

  if (!$.fn.tab) {
    $.fn.tab = function (action) {
      if (action !== "show") return this;

      return this.each(function () {
        var $link = $(this);
        var target = $link.attr("href");
        if (!target || target.charAt(0) !== "#") return;

        var $li = $link.closest("li");
        $li.siblings().removeClass("active");
        $li.addClass("active");

        var $pane = $(target);
        $pane
          .siblings(".tab-pane")
          .removeClass("active in")
          .hide();
        $pane.addClass("active in").show();
      });
    };

    $(document).on("click", "[data-toggle='tab']", function (ev) {
      ev.preventDefault();
      $(this).tab("show");
    });
  }

  if (!$.fn.tooltip) {
    $.fn.tooltip = function () {
      return this;
    };
  }
})();

