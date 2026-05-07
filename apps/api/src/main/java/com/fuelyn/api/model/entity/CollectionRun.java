package com.fuelyn.api.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "collection_runs")
public class CollectionRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDateTime startedAt;

    private LocalDateTime completedAt;

    private Integer stationsCount;

    private Integer pricesCount;

    @Column(length = 20)
    private String status;

    @Column(length = 2000)
    private String error;

    public CollectionRun() {
    }

    public static CollectionRun start() {
        CollectionRun run = new CollectionRun();
        run.setStartedAt(LocalDateTime.now());
        run.setStatus("running");
        return run;
    }

    public void complete(int stationsCount, int pricesCount) {
        this.stationsCount = stationsCount;
        this.pricesCount = pricesCount;
        this.completedAt = LocalDateTime.now();
        this.status = "completed";
    }

    public void fail(String error) {
        this.completedAt = LocalDateTime.now();
        this.status = "failed";
        this.error = error != null && error.length() > 2000 ? error.substring(0, 2000) : error;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public LocalDateTime getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(LocalDateTime startedAt) {
        this.startedAt = startedAt;
    }

    public LocalDateTime getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(LocalDateTime completedAt) {
        this.completedAt = completedAt;
    }

    public Integer getStationsCount() {
        return stationsCount;
    }

    public void setStationsCount(Integer stationsCount) {
        this.stationsCount = stationsCount;
    }

    public Integer getPricesCount() {
        return pricesCount;
    }

    public void setPricesCount(Integer pricesCount) {
        this.pricesCount = pricesCount;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }
}
