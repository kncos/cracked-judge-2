{
  pkgs,
  lib,
  config,
  ...
}:
{
  # requires this because we intentionally trigger oom to test isolate
  boot.kernel.sysctl."vm.panic_on_oom" = 0;
  boot.kernelParams = [
    "loglevel=3"
    "quiet"
    "udev.log_level=3"
    "rd.systemd.show_status=false"
  ];
  boot.consoleLogLevel = lib.mkForce 3;
  virtualisation.diskSize = 16384;

  environment.systemPackages = with pkgs; [
    iperf3
  ];
}
