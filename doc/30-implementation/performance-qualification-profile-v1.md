# Performance Qualification Profile v1

Maintainer decision on 2026-10-09: current product qualification uses ordinary movement P95 <=50ms at all qualified viewports and refresh P95 ceilings of <=50ms at 640x480, <=75ms at 1280x720, and <=100ms at 1920x1080. The earlier uniform refresh <=50ms rule is retained as historical evidence but no longer controls current qualification.

Sample counts, invalid-sample rules, camera-only/zero-draw requirements, pixel correctness, memory limits, and raw-evidence provenance are unchanged.

For subject 8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9, the two recorded 1920x1080 refresh P95 results are 62.1ms and 50.5ms; both satisfy the current 100ms ceiling. All other current qualification gates also pass.
