package com.smartaccess.scheduler;

import com.smartaccess.service.AlertRuleService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;

/** Đánh giá quy tắc cảnh báo định kỳ; 30 giây đủ nhanh so với ngưỡng offline 5 phút và cửa mở 60 giây. */
@Component
public class AlertRuleScheduler {
    private final AlertRuleService rules;

    public AlertRuleScheduler(AlertRuleService rules) { this.rules = rules; }

    @Scheduled(fixedDelay = 30000)
    public void evaluate() {
        rules.evaluate(LocalDateTime.now());
    }
}
