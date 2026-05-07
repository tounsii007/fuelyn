package com.fuelyn.api.repository;

import com.fuelyn.api.model.entity.StationMeta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StationMetaRepository extends JpaRepository<StationMeta, String> {

    List<StationMeta> findByCity(String city);

    List<StationMeta> findByBrand(String brand);
}
